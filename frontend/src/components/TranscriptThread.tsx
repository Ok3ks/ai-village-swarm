import { useEffect, useMemo, useState } from "react";
import { fetchTree } from "../lib/api";
import type { Tree, TranscriptSummary, Turn } from "../lib/types";
import { TurnCard } from "./TurnCard";

const PAGE_SIZE = 150;

interface Props {
  summary: TranscriptSummary | null;
  onSummarize: (turns: Turn[], label: string) => void;
}

export function TranscriptThread({ summary, onSummarize }: Props) {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setTree(null);
    setError(null);
    setVisibleCount(PAGE_SIZE);
    setSelectedIds(new Set());
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

  const handleSummarize = () => {
    const selected = allTurns.filter((t) => selectedIds.has(t.id));
    onSummarize(selected, `Summarize ${selected.length} selected turn(s) from ${summary?.id ?? "transcript"}`);
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
          disabled={selectedIds.size <= 1}
          title={selectedIds.size <= 1 ? "Select more than one turn to summarize" : undefined}
          onClick={handleSummarize}
        >
          Summarize selected
        </button>
        {selectedIds.size > 0 && (
          <button className="expand-btn" onClick={clearSelection}>
            Clear selection
          </button>
        )}
      </div>

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
