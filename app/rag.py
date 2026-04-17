import json
import math
import os
import hashlib
import threading
from dataclasses import dataclass
from typing import List, Tuple

from langchain_ollama import OllamaEmbeddings

from app.config import (
    OLLAMA_BASE_URL,
    OLLAMA_EMBED_MODEL,
    RAG_CHUNK_OVERLAP,
    RAG_CHUNK_SIZE,
    RAG_FORCE_REINDEX,
    RAG_INDEX_PATH,
    RAG_KB_PATH,
    RAG_MIN_SCORE,
    RAG_TOP_K,
)


@dataclass
class RagChunk:
    chunk_id: str
    source: str
    content: str
    embedding: List[float]


_index_lock = threading.Lock()
_cached_index: List[RagChunk] | None = None
_cached_kb_signature: str = ""
_embedder: OllamaEmbeddings | None = None


def _kb_files() -> List[str]:
    if not os.path.isdir(RAG_KB_PATH):
        return []

    files: List[str] = []
    for root, _, filenames in os.walk(RAG_KB_PATH):
        for name in filenames:
            if name.lower().endswith((".md", ".txt")):
                files.append(os.path.join(root, name))
    return files


def _kb_signature(paths: List[str]) -> str:
    hasher = hashlib.sha256()
    for path in sorted(paths):
        try:
            stat = os.stat(path)
        except OSError:
            continue
        source = os.path.relpath(path, RAG_KB_PATH).replace("\\", "/")
        hasher.update(source.encode("utf-8"))
        hasher.update(b"|")
        hasher.update(str(stat.st_size).encode("ascii"))
        hasher.update(b"|")
        hasher.update(str(getattr(stat, "st_mtime_ns", int(stat.st_mtime * 1_000_000_000))).encode("ascii"))
        hasher.update(b"\n")
    return hasher.hexdigest()


def _get_embedder() -> OllamaEmbeddings:
    global _embedder
    if _embedder is None:
        _embedder = OllamaEmbeddings(model=OLLAMA_EMBED_MODEL, base_url=OLLAMA_BASE_URL)
    return _embedder


def _chunk_text(text: str) -> List[str]:
    cleaned = text.replace("\r\n", "\n").strip()
    if not cleaned:
        return []

    chunks: List[str] = []
    start = 0
    length = len(cleaned)
    while start < length:
        end = min(start + RAG_CHUNK_SIZE, length)
        if end < length:
            window = cleaned[start:end]
            split_at = window.rfind("\n")
            if split_at > RAG_CHUNK_SIZE * 0.6:
                end = start + split_at
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == length:
            break
        start = max(end - RAG_CHUNK_OVERLAP, 0)
    return chunks


def _load_kb_chunks(kb_files: List[str]) -> List[Tuple[str, str, str]]:
    items: List[Tuple[str, str, str]] = []
    for path in kb_files:
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
        except OSError:
            continue

        source = os.path.relpath(path, RAG_KB_PATH)
        for idx, chunk in enumerate(_chunk_text(text)):
            chunk_id = f"{source}:{idx}"
            items.append((chunk_id, source, chunk))
    return items


def _write_index_to_disk(kb_signature: str, rag_chunks: List[RagChunk]) -> None:
    payload = {
        "kb_signature": kb_signature,
        "chunks": [chunk.__dict__ for chunk in rag_chunks],
    }

    try:
        index_dir = os.path.dirname(RAG_INDEX_PATH)
        if index_dir:
            os.makedirs(index_dir, exist_ok=True)
        with open(RAG_INDEX_PATH, "w", encoding="utf-8") as handle:
            json.dump(payload, handle)
    except OSError:
        pass


def _build_index(kb_files: List[str], kb_signature: str) -> List[RagChunk]:
    chunks = _load_kb_chunks(kb_files)
    if not chunks:
        _write_index_to_disk(kb_signature, [])
        return []

    texts = [chunk[2] for chunk in chunks]
    embeddings = _get_embedder().embed_documents(texts)

    rag_chunks: List[RagChunk] = []
    for (chunk_id, source, content), embedding in zip(chunks, embeddings):
        rag_chunks.append(
            RagChunk(
                chunk_id=chunk_id,
                source=source,
                content=content,
                embedding=list(embedding),
            )
        )

    _write_index_to_disk(kb_signature, rag_chunks)
    return rag_chunks


def _load_index_from_disk() -> Tuple[str, List[RagChunk]]:
    try:
        with open(RAG_INDEX_PATH, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return "", []

    # Backward compatibility: older index stored just an array of chunks.
    if isinstance(raw, list):
        raw_chunks = raw
        kb_signature = ""
    elif isinstance(raw, dict):
        kb_signature = str(raw.get("kb_signature", ""))
        raw_chunks = raw.get("chunks") or []
    else:
        return "", []

    chunks: List[RagChunk] = []
    for item in raw_chunks:
        if not isinstance(item, dict):
            continue
        chunks.append(
            RagChunk(
                chunk_id=item.get("chunk_id", ""),
                source=item.get("source", ""),
                content=item.get("content", ""),
                embedding=item.get("embedding") or [],
            )
        )
    return kb_signature, chunks


def get_index() -> List[RagChunk]:
    global _cached_index, _cached_kb_signature
    kb_files = _kb_files()
    kb_signature = _kb_signature(kb_files)

    with _index_lock:
        if _cached_index is not None and _cached_kb_signature == kb_signature and not RAG_FORCE_REINDEX:
            return _cached_index

        if not RAG_FORCE_REINDEX:
            disk_signature, disk_index = _load_index_from_disk()
            if disk_signature == kb_signature:
                _cached_index = disk_index
                _cached_kb_signature = kb_signature
                return _cached_index

        _cached_index = _build_index(kb_files, kb_signature)
        _cached_kb_signature = kb_signature
        return _cached_index


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / math.sqrt(norm_a * norm_b)


def retrieve(query: str, top_k: int | None = None) -> List[Tuple[RagChunk, float]]:
    if not query.strip():
        return []

    index = get_index()
    if not index:
        return []

    query_embedding = _get_embedder().embed_query(query)

    scored: List[Tuple[RagChunk, float]] = []
    for chunk in index:
        score = _cosine_similarity(query_embedding, chunk.embedding)
        if score >= RAG_MIN_SCORE:
            scored.append((chunk, score))

    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[: (top_k or RAG_TOP_K)]
