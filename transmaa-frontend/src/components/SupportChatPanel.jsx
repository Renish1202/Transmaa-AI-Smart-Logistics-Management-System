import { useEffect, useRef, useState } from "react";
import API from "../services/api";

export default function SupportChatPanel({ height = "70vh" }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, loading]);

  const sendToSupport = async (text) => {
    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await API.post("/ai/support", {
        message: text,
        history: newMessages
          .filter((msg) => msg.role !== "system")
          .slice(-8),
      });

      const reply = response.data?.reply || "Sorry, I didn't get that.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (error) {
      const backendDetail = error.response?.data?.detail;
      const message =
        typeof backendDetail === "string" && backendDetail.trim()
          ? `Support is unavailable: ${backendDetail}`
          : "Support is temporarily unavailable. Please try again.";
      console.log(error.response?.data || error.message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: message },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    await sendToSupport(trimmed);
  };

  return (
    <div className="flex flex-col" style={{ height }}>
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Support Chat</h1>
        <p className="text-sm text-gray-500">Ask anything about your account, rides, or payments.</p>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto space-y-3 p-4 border rounded bg-gray-50"
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={
              msg.role === "user"
                ? "flex justify-end"
                : "flex justify-start"
            }
          >
            <div
              className={
                msg.role === "user"
                  ? "bg-blue-600 text-white px-4 py-2 rounded-lg max-w-[80%]"
                  : "bg-white text-gray-800 px-4 py-2 rounded-lg border max-w-[80%]"
              }
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-600 px-4 py-2 rounded-lg border max-w-[80%]" aria-live="polite">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Support is typing</span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce"
                    style={{ animationDelay: "120ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce"
                    style={{ animationDelay: "240ms" }}
                  />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="mt-4 flex gap-2">
        <input
          type="text"
          className="flex-1 border rounded p-3"
          placeholder="Ask about the app, rides, or policies"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-5 rounded hover:bg-blue-700 disabled:opacity-60"
          disabled={loading}
        >
          Send
        </button>
      </form>
    </div>
  );
}
