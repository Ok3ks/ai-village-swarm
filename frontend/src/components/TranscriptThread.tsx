import { useEffect, useMemo, useState } from "react";
import { fetchTree } from "../lib/api";
import { useAppStore } from "../lib/store";
import type { Tree, TranscriptSummary, Turn } from "../lib/types";
import { TurnCard } from "./TurnCard";

const PAGE_SIZE = 150;

export function TranscriptThread({ summary }: { summary: TranscriptSummary | null }) {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const chatSelection = useAppStore((s) => s.chatSelection);
  const toggleChatSelection = useAppStore((s) => s.toggleChatSelection);

  useEffect(() => {
    setTree(null);
    setError(null);
    setVisibleCount(PAGE_SIZE);
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

  const turnsById = useMemo(() => {
    if (!tree) return new Map<string, Turn>();
    return new Map([tree.root, ...tree.turns].map((t) => [t.id, t]));
  }, [tree]);

  const isSelected = (id: string) => chatSelection.some((t) => t.id === id);
  const toggleSelect = (id: string) => {
    const turn = turnsById.get(id);
    if (turn) toggleChatSelection(turn);
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
      <TurnCard turn={tree.root} isRoot selected={isSelected(tree.root.id)} onToggleSelect={toggleSelect} />
      {tree.turns.length === 0 && (
        <div className="no-turns">No further turns were captured for this transcript.</div>
      )}
      {shown.map((t) => (
        <TurnCard key={t.id} turn={t} isRoot={false} selected={isSelected(t.id)} onToggleSelect={toggleSelect} />
      ))}
      {remaining > 0 && (
        <button className="expand-btn" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
          Load {Math.min(PAGE_SIZE, remaining)} more ({remaining} remaining)
        </button>
      )}
    </div>
  );
}
