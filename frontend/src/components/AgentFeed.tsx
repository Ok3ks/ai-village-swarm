import { useEffect, useState } from "react";
import { fetchTree } from "../lib/api";
import { useAppStore } from "../lib/store";
import type { TranscriptSummary, Turn } from "../lib/types";
import { TurnCard } from "./TurnCard";

const FETCH_CAP = 200;

interface Props {
  agentName: string;
  rows: TranscriptSummary[];
}

export function AgentFeed({ agentName, rows }: Props) {
  const chatSelection = useAppStore((s) => s.chatSelection);
  const toggleChatSelection = useAppStore((s) => s.toggleChatSelection);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);

  const sorted = rows.slice().sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const capped = sorted.slice(0, FETCH_CAP);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      capped.map((r) =>
        fetchTree(r)
          .then((t) => t.root)
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      setTurns(results.filter((t): t is Turn => t !== null));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentName, capped.map((r) => r.id).join(",")]);

  const isSelected = (id: string) => chatSelection.some((t) => t.id === id);
  const toggleSelect = (id: string) => {
    const turn = turns.find((t) => t.id === id);
    if (turn) toggleChatSelection(turn);
  };

  return (
    <div className="thread">
      <div className="turn-card turn-root">
        <div className="turn-header">
          <span className="turn-agent">{agentName}</span>
          <span className="turn-id">{rows.length.toLocaleString()} event(s)</span>
        </div>
      </div>
      {rows.length > FETCH_CAP && (
        <p className="muted small">
          Showing the first {FETCH_CAP.toLocaleString()} of {rows.length.toLocaleString()} events.
        </p>
      )}
      {loading ? (
        <p className="muted small">Loading {capped.length.toLocaleString()} event(s)…</p>
      ) : turns.length === 0 ? (
        <div className="no-turns">No events captured for this agent.</div>
      ) : (
        turns.map((t) => (
          <TurnCard key={t.id} turn={t} isRoot={false} selected={isSelected(t.id)} onToggleSelect={toggleSelect} />
        ))
      )}
    </div>
  );
}
