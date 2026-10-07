import { useMemo, useState } from "react";
import type { SourceKind, TranscriptSummary } from "../lib/types";

const RENDER_CAP = 250;

interface Props {
  source: SourceKind;
  onSourceChange: (s: SourceKind) => void;
  rows: TranscriptSummary[];
  loadedChunks: number;
  totalChunks: number;
  loading: boolean;
  treesCount: number;
  orphansCount: number;
  claudeCodeCount: number;
  selectedId: string | null;
  onSelect: (s: TranscriptSummary) => void;
}

// Numeric-id corpora (swarmtraces) don't carry real timestamps, but ids were
// assigned in crawl/discovery order, so the numeric suffix is a usable
// chronological proxy (R0000001 before R0000002, ...).
function idSortKey(id: string): number {
  const m = id.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function chronoKey(r: TranscriptSummary): string | number {
  return r.startTime ?? idSortKey(r.id);
}

function dateLabel(startTime?: string): string | null {
  if (!startTime) return null;
  return startTime.slice(0, 10); // "2026-03-02"
}

// Stable hash -> hue so each agent/lane gets a consistent color, like branch
// colors in a git graph.
function laneColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 60%)`;
}

type Row =
  | { type: "divider"; key: string; label: string }
  | { type: "item"; key: string; row: TranscriptSummary };

export function Sidebar({
  source,
  onSourceChange,
  rows,
  loadedChunks,
  totalChunks,
  loading,
  treesCount,
  orphansCount,
  claudeCodeCount,
  selectedId,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string | null>(null);

  const availableKinds = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r.kindCounts)) seen.add(k);
    return Array.from(seen).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = rows.filter((r) => {
      if (kindFilter && !(r.kindCounts[kindFilter as keyof typeof r.kindCounts] ?? 0)) {
        return false;
      }
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.preview.toLowerCase().includes(q) ||
        (r.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
    return matches.slice().sort((a, b) => (chronoKey(a) < chronoKey(b) ? -1 : chronoKey(a) > chronoKey(b) ? 1 : 0));
  }, [rows, query, kindFilter]);

  const visible = filtered.slice(0, RENDER_CAP);

  // Interleave date-divider rows (git-log-style "commits on <date>" headers)
  // whenever real timestamps are available; swarmtraces rows have none, so
  // this collapses to a single flat chronological list for those sources.
  const timeline = useMemo(() => {
    const out: Row[] = [];
    let lastDate: string | null = null;
    for (const r of visible) {
      const d = dateLabel(r.startTime);
      if (d && d !== lastDate) {
        out.push({ type: "divider", key: `div-${d}`, label: d });
        lastDate = d;
      }
      out.push({ type: "item", key: r.id, row: r });
    }
    return out;
  }, [visible]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>AI Village Transcripts</h1>
        <div className="source-toggle">
          <button
            className={source === "claudeCode" ? "active" : ""}
            onClick={() => onSourceChange("claudeCode")}
          >
            Claude Code ({claudeCodeCount.toLocaleString()})
          </button>
          <button
            className={source === "trees" ? "active" : ""}
            onClick={() => onSourceChange("trees")}
          >
            Attack chains ({treesCount.toLocaleString()})
          </button>
          <button
            className={source === "orphans" ? "active" : ""}
            onClick={() => onSourceChange("orphans")}
          >
            Unanswered ({orphansCount.toLocaleString()})
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search id, text, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {availableKinds.length > 0 && (
          <div className="kind-chips">
            {availableKinds.map((k) => (
              <button
                key={k}
                className={`chip chip-${k} ${kindFilter === k ? "active" : ""}`}
                onClick={() => setKindFilter(kindFilter === k ? null : k)}
              >
                {k}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-status">
        {loading
          ? `Loading index… ${loadedChunks}/${totalChunks} chunks (${rows.length.toLocaleString()} loaded)`
          : `${filtered.length.toLocaleString()} matching, oldest → newest${
              filtered.length > RENDER_CAP ? `, showing first ${RENDER_CAP}` : ""
            }`}
      </div>

      <ul className="transcript-list">
        {timeline.map((entry) => {
          if (entry.type === "divider") {
            return (
              <li key={entry.key} className="date-divider">
                <span>{entry.label}</span>
              </li>
            );
          }
          const r = entry.row;
          // Only agent-attributed sources (claude code) have a real "lane" to
          // color, like a branch in a git graph; other sources get a neutral
          // rail so the color doesn't imply a grouping that isn't there.
          const lane = r.agentId ? laneColor(r.agentId) : "var(--border)";
          return (
            <li
              key={entry.key}
              className={`timeline-item ${r.id === selectedId ? "selected" : ""}`}
              onClick={() => onSelect(r)}
            >
              <div className="rail">
                <span className="rail-line" style={{ background: lane }} />
                <span className="rail-dot" style={{ background: lane, borderColor: lane }} />
              </div>
              <div className="row-body">
                <div className="row-top">
                  <span className="row-id">{r.id}</span>
                  <span className="row-badges">
                    {Object.entries(r.kindCounts).map(([k, v]) => (
                      <span key={k} className={`badge badge-${k}`}>
                        {v}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="row-preview">{r.preview || <em>(empty)</em>}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
