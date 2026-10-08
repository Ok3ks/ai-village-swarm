import { useEffect, useRef, useState } from "react";
import {
  buildSummarizePrompt,
  classifyTurns,
  MODEL,
  parseCategories,
  sendChatMessages,
  type ChatMessage,
  type ClassifyResult,
} from "../lib/llm";
import { useAppStore } from "../lib/store";

interface DisplayMessage extends ChatMessage {
  label?: string;
}

export function ChatPanel() {
  const chatSelection = useAppStore((s) => s.chatSelection);
  const removeFromChatSelection = useAppStore((s) => s.removeFromChatSelection);
  const clearChatSelection = useAppStore((s) => s.clearChatSelection);
  const closeChat = useAppStore((s) => s.closeChat);
  const setChatDirty = useAppStore((s) => s.setChatDirty);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ name: string; message: string } | null>(null);

  const [categoriesInput, setCategoriesInput] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const [classifyError, setClassifyError] = useState<{ name: string; message: string } | null>(null);
  const categories = parseCategories(categoriesInput);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChatDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, error]);

  const sendText = async (content: string, label?: string) => {
    const next = [...messages, { role: "user" as const, content, label }];
    setMessages(next);
    setError(null);
    setSending(true);
    setChatDirty(true);
    try {
      const reply = await sendChatMessages(next.map(({ role, content }) => ({ role, content })));
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setError({ name: e instanceof Error ? e.name : "Error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  };

  const handleDiscuss = () => {
    if (chatSelection.length === 0 || sending) return;
    const label = `Discuss ${chatSelection.length} selected item(s)`;
    const prompt = buildSummarizePrompt(chatSelection);
    clearChatSelection();
    sendText(prompt, label);
  };

  const handleClassify = async () => {
    setClassifying(true);
    setClassifyResult(null);
    setClassifyError(null);
    try {
      const r = await classifyTurns(chatSelection, categories);
      setClassifyResult(r);
    } catch (e) {
      setClassifyError({
        name: e instanceof Error ? e.name : "Error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setClassifying(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    sendText(text);
  };

  const previewById = new Map(chatSelection.map((t) => [t.id, t.cite ? `${t.cite}: ${t.text}` : t.text]));

  return (
    <aside className="metadata-panel chat-panel">
      <div className="chat-header">
        <h2>Chat · {MODEL}</h2>
        <button className="copy-btn" onClick={closeChat}>
          close
        </button>
      </div>

      {chatSelection.length > 0 && (
        <div className="chat-cart">
          <div className="chat-cart-header">
            <span className="muted small">{chatSelection.length} item(s) added</span>
            <button className="copy-btn" onClick={clearChatSelection}>
              clear
            </button>
          </div>
          <ul className="chat-cart-list">
            {chatSelection.map((t) => (
              <li key={t.id}>
                <span className="chat-cart-item-text">
                  {t.cite ? `${t.cite}: ` : ""}
                  {t.text.slice(0, 80)}
                </span>
                <button className="copy-btn" onClick={() => removeFromChatSelection(t.id)} title="Remove">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button className="summarize-btn" disabled={sending} onClick={handleDiscuss}>
            Discuss {chatSelection.length} item(s)
          </button>

          <div className="classify-bar">
            <input
              type="text"
              className="classify-categories"
              placeholder="Categories to classify into, comma-separated (e.g. benign, prompt-injection, collusion)"
              value={categoriesInput}
              onChange={(e) => setCategoriesInput(e.target.value)}
            />
            <button
              className="summarize-btn"
              disabled={classifying || categories.length === 0 || chatSelection.length <= 1}
              onClick={handleClassify}
              title={
                chatSelection.length <= 1
                  ? "Add more than one item to classify"
                  : categories.length === 0
                    ? "Enter at least one category"
                    : undefined
              }
            >
              {classifying ? "Classifying…" : `Classify ${chatSelection.length} item(s)`}
            </button>
          </div>
        </div>
      )}

      {classifyError && (
        <div className="summary-card error">
          <div className="turn-header">
            <span className="turn-role">LLM ERROR</span>
            <span className="turn-id">{classifyError.name}</span>
            <button className="copy-btn" onClick={() => setClassifyError(null)}>
              dismiss
            </button>
          </div>
          <pre className="turn-text">{classifyError.message}</pre>
        </div>
      )}

      {classifyResult && (
        <div className="summary-card">
          <div className="turn-header">
            <span className="turn-role">CLASSIFICATION</span>
            <span className="turn-id">{classifyResult.model}</span>
            <span className="turn-cite">{Math.round(classifyResult.tookMs)}ms</span>
            <button className="copy-btn" onClick={() => setClassifyResult(null)}>
              dismiss
            </button>
          </div>
          <table className="classify-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Label</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {classifyResult.items.map((item) => (
                <tr key={item.id}>
                  <td className="classify-event-cell" title={item.id}>
                    {previewById.get(item.id) || item.id}
                  </td>
                  <td>
                    <span className="tag">{item.label}</span>
                  </td>
                  <td>{item.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && !sending && !error && chatSelection.length === 0 && (
          <p className="muted small">
            Check events, chat messages, or turns anywhere in the app to add them here, or just ask the
            local LLM anything below.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg-${m.role}`}>
            <span className="chat-msg-role">{m.role === "user" ? "you" : "llm"}</span>
            <pre className="chat-msg-text">{m.label ?? m.content}</pre>
          </div>
        ))}
        {sending && <div className="chat-msg chat-msg-assistant muted small">thinking…</div>}
        {error && (
          <div className="chat-msg chat-msg-error">
            <span className="chat-msg-role">error</span>
            <pre className="chat-msg-text">
              {error.name}: {error.message}
            </pre>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          type="text"
          placeholder="Ask a follow-up…"
          value={input}
          disabled={sending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
        />
        <button className="summarize-btn" disabled={sending || !input.trim()} onClick={handleSend}>
          Send
        </button>
      </div>
    </aside>
  );
}
