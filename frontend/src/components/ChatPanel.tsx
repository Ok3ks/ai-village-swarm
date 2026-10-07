import { useEffect, useRef, useState } from "react";
import { buildSummarizePrompt, MODEL, sendChatMessages, type ChatMessage } from "../lib/llm";
import type { Turn } from "../lib/types";

interface DisplayMessage extends ChatMessage {
  label?: string;
}

export interface ChatContext {
  turns: Turn[];
  label: string;
}

interface Props {
  context: ChatContext;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ChatPanel({ context, onClose, onDirtyChange }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ name: string; message: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const contextKey = `${context.label}:${context.turns.map((t) => t.id).join(",")}`;

  useEffect(() => {
    setError(null);
    onDirtyChange?.(false);

    // A blank context (e.g. the always-available Chat tab, opened with no
    // selection) shouldn't send a seeded "summarize nothing" prompt -- just
    // present an empty, ready-to-type conversation.
    if (context.turns.length === 0) {
      setMessages([]);
      setSending(false);
      return;
    }

    const initial: DisplayMessage = {
      role: "user",
      content: buildSummarizePrompt(context.turns),
      label: context.label,
    };
    setMessages([initial]);
    setSending(true);
    sendChatMessages([{ role: "user", content: initial.content }])
      .then((reply) => setMessages((prev) => [...prev, { role: "assistant", content: reply }]))
      .catch((e) =>
        setError({ name: e instanceof Error ? e.name : "Error", message: e instanceof Error ? e.message : String(e) })
      )
      .finally(() => setSending(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, error]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setError(null);
    setSending(true);
    onDirtyChange?.(true);
    try {
      const reply = await sendChatMessages(next.map(({ role, content }) => ({ role, content })));
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setError({ name: e instanceof Error ? e.name : "Error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="metadata-panel chat-panel">
      <div className="chat-header">
        <h2>Chat · {MODEL}</h2>
        <button className="copy-btn" onClick={onClose}>
          close
        </button>
      </div>
      <p className="muted small">{context.label}</p>

      <div className="chat-messages">
        {messages.length === 0 && !sending && !error && (
          <p className="muted small">Ask the local LLM anything — this chat isn't seeded with any specific data.</p>
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
