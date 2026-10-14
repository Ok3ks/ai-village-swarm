import { useState } from "react";
import type { Turn } from "../lib/types";

const COLLAPSE_THRESHOLD = 1200;

const ROLE_LABEL: Record<Turn["kind"], string> = {
  payload: "PAYLOAD · attacker",
  response: "RESPONSE · target",
  recovered_text: "RECOVERED TEXT · decoded effect",
  user: "USER / TOOL RESULT",
  assistant: "ASSISTANT",
  system: "SYSTEM",
  result: "RESULT",
  event: "EVENT",
  chat: "CHAT MESSAGE",
};

interface Props {
  turn: Turn;
  isRoot: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}

export function TurnCard({ turn, isRoot, selected, onToggleSelect }: Props) {
  const long = turn.text.length > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!long);

  return (
    <div className={`turn-card turn-${turn.kind} ${isRoot ? "turn-root" : ""} ${selected ? "turn-selected" : ""}`}>
      <div className="turn-header">
        <input
          type="checkbox"
          className="turn-select"
          checked={selected}
          onChange={() => onToggleSelect(turn.id)}
          title="Add to chat"
        />
        <span className="turn-role">{ROLE_LABEL[turn.kind] ?? turn.kind}</span>
        {turn.subtype && <span className="turn-id">{turn.subtype}</span>}
        <span className="turn-id">{turn.id}</span>
        {turn.cite &&
          (turn.kind === "chat" ? (
            <span className="turn-agent">{turn.cite}</span>
          ) : (
            <span className="turn-cite">{turn.cite}</span>
          ))}
        {turn.createdAt && <span className="turn-cite">{turn.createdAt}</span>}
      </div>
      {turn.tags && turn.tags.length > 0 && (
        <div className="turn-tags">
          {turn.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}
      <pre className={`turn-text ${expanded ? "" : "clamped"}`}>
        {expanded ? turn.text : `${turn.text.slice(0, COLLAPSE_THRESHOLD)}…`}
      </pre>
      {long && (
        <button
          className="expand-btn"
          onClick={() => setExpanded((e) => !e)}
          title={expanded ? "Collapse back to a preview" : "Show the full, untruncated text"}
        >
          {expanded ? "Show less" : `Show all (${turn.text.length.toLocaleString()} chars)`}
        </button>
      )}
    </div>
  );
}
