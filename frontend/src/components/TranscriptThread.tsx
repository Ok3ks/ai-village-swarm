import { useEffect, useMemo, useState } from "react";
import { fetchTree } from "../lib/api";
import { summarizeTurns, type SummarizeResult } from "../lib/mockLlm";
import type { Tree, TranscriptSummary, Turn } from "../lib/types";
import { TurnCard } from "./TurnCard";

const PAGE_SIZE = 150;

export function TranscriptThread({ summary }: { summary: TranscriptSummary | null }) {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [summarizing, setSummarizing] = useState(false);
  const [result, setResult] = useState<SummarizeResult | null>(null);

  useEffect(() => {
    setTree(null);
    setError(null);
    setVisibleCount(PAGE_SIZE);
    setSelectedIds(new Set());
    setResult(null);
    if (!summary) return;
    let cancelled = false;
    fetchTree(summary)
      .then((t) => {
        if (!cancelled) setTree(t);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [summary]);

  const allTurns: Turn[] = useMemo(() => (tree ? [tree.root, ...tree.turns] : []), [tree]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleSummarize = async () => {
    const selected = allTurns.filter((t) => selectedIds.has(t.id));
    setSummarizing(true);
    setResult(null);
    try {
      const r = await summarizeTurns(selected);
      setResult(r);
    } finally {
      setSummarizing(false);
    }
  };

  if (!summary) {
    return (
      <div className="thread empty-state">
        <p>Select a transcript from the left to view it.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="thread empty-state">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="thread empty-state">
        <p>Loading transcript…</p>
      </div>
    );
  }

  const shown = tree.turns.slice(0, visibleCount);
  const remaining = tree.turns.length - shown.length;

  return (
    <div className="thread">
      <div className="summarize-bar">
        <span className="muted small">{selectedIds.size} turn(s) selected</span>
        <button
          className="summarize-btn"
          disabled={selectedIds.size === 0 || summarizing}
          onClick={handleSummarize}
        >
          {summarizing ? "Summarizing…" : "Summarize selected"}
        </button>
        {selectedIds.size > 0 && (
          <button className="expand-btn" onClick={clearSelection}>
            Clear selection
          </button>
        )}
      </div>

      {result && (
        <div className="summary-card">
          <div className="turn-header">
            <span className="turn-role">MOCK LLM SUMMARY</span>
            <span className="turn-id">{result.model}</span>
            <span className="turn-cite">{Math.round(result.tookMs)}ms</span>
            <button className="copy-btn" onClick={() => setResult(null)}>
              dismiss
            </button>
          </div>
          <pre className="turn-text">{result.text}</pre>
        </div>
      )}

      <TurnCard turn={tree.root} isRoot selected={selectedIds.has(tree.root.id)} onToggleSelect={toggleSelect} />
      {tree.turns.length === 0 && (
        <div className="no-turns">No further turns were captured for this transcript.</div>
      )}
      {shown.map((t) => (
        <TurnCard key={t.id} turn={t} isRoot={false} selected={selectedIds.has(t.id)} onToggleSelect={toggleSelect} />
      ))}
      {remaining > 0 && (
        <button className="expand-btn" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
          Load {Math.min(PAGE_SIZE, remaining)} more ({remaining} remaining)
        </button>
      )}
    </div>
  );
}
