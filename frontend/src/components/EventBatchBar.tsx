import { useState } from "react";
import { fetchTree } from "../lib/api";
import { summarizeTurns, type SummarizeResult } from "../lib/llm";
import type { TranscriptSummary } from "../lib/types";

interface Props {
  selectedRows: TranscriptSummary[];
  onClear: () => void;
}

export function EventBatchBar({ selectedRows, onClear }: Props) {
  const [summarizing, setSummarizing] = useState(false);
  const [result, setResult] = useState<SummarizeResult | null>(null);
  const [error, setError] = useState<{ name: string; message: string } | null>(null);

  const handleSummarize = async () => {
    setSummarizing(true);
    setResult(null);
    setError(null);
    try {
      const trees = await Promise.all(selectedRows.map((r) => fetchTree(r)));
      const turns = trees.map((t) => t.root);
      const r = await summarizeTurns(turns);
      setResult(r);
    } catch (e) {
      setError({
        name: e instanceof Error ? e.name : "Error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSummarizing(false);
    }
  };

  if (selectedRows.length === 0) return null;

  return (
    <div className="event-batch-bar">
      <div className="summarize-bar">
        <span className="muted small">{selectedRows.length} event(s) selected</span>
        <button className="summarize-btn" disabled={summarizing} onClick={handleSummarize}>
          {summarizing ? "Summarizing…" : "Summarize selected"}
        </button>
        <button
          className="expand-btn"
          onClick={() => {
            setResult(null);
            setError(null);
            onClear();
          }}
        >
          Clear selection
        </button>
      </div>

      {error && (
        <div className="summary-card error">
          <div className="turn-header">
            <span className="turn-role">LLM ERROR</span>
            <span className="turn-id">{error.name}</span>
            <button className="copy-btn" onClick={() => setError(null)}>
              dismiss
            </button>
          </div>
          <pre className="turn-text">{error.message}</pre>
        </div>
      )}

      {result && (
        <div className="summary-card">
          <div className="turn-header">
            <span className="turn-role">BATCH LLM SUMMARY</span>
            <span className="turn-id">{result.model}</span>
            <span className="turn-cite">{Math.round(result.tookMs)}ms</span>
            <button className="copy-btn" onClick={() => setResult(null)}>
              dismiss
            </button>
          </div>
          <pre className="turn-text">{result.text}</pre>
        </div>
      )}
    </div>
  );
}
