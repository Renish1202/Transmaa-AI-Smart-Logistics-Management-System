import os
from dotenv import load_dotenv

load_dotenv()

# Backward compatibility with old SQLAlchemy config references.
DATABASE_URL = os.getenv("DATABASE_URL", "")
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://127.0.0.1:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "transmaa")
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-in-env")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
RESET_TOKEN_EXPIRE_MINUTES = int(os.getenv("RESET_TOKEN_EXPIRE_MINUTES", "30"))
RESET_TOKEN_DEBUG = os.getenv("RESET_TOKEN_DEBUG", "false").lower() == "true"
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://127.0.0.1:5173")
ADMIN_REGISTRATION_CODE = os.getenv("ADMIN_REGISTRATION_CODE", "")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral:latest")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "180"))
OLLAMA_NUM_PREDICT = int(os.getenv("OLLAMA_NUM_PREDICT", "256"))
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "2048"))
OLLAMA_TEMPERATURE = float(os.getenv("OLLAMA_TEMPERATURE", "0.2"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "5m")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")

RAG_KB_PATH = os.getenv("RAG_KB_PATH", os.path.join("app", "knowledge_base"))
RAG_INDEX_PATH = os.getenv("RAG_INDEX_PATH", os.path.join("app", "knowledge_base", ".rag_index.json"))
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "4"))
RAG_CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "900"))
RAG_CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "150"))
RAG_MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.2"))
RAG_FORCE_REINDEX = os.getenv("RAG_FORCE_REINDEX", "false").lower() == "true"

PAYMENT_PROVIDER = os.getenv("PAYMENT_PROVIDER", "razorpay")
PAYMENT_CURRENCY = os.getenv("PAYMENT_CURRENCY", "INR")
PAYMENT_SIMULATION_ENABLED = os.getenv("PAYMENT_SIMULATION_ENABLED", "true").lower() == "true"

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
