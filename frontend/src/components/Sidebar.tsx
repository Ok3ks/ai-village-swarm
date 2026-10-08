import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../lib/store";
import type { SourceKind, TranscriptSummary } from "../lib/types";
import { SidebarRow } from "./SidebarRow";

const RENDER_CAP = 250;

type Group = "transcripts" | "village";

// Claude Code transcripts come from agents running inside this village, and
// Events/Rooms/Network are the village's own activity log -- all distinct
// from the swarmtraces attack corpus, which is an unrelated external
// dataset (the only thing left in the "Transcripts" group).
const VILLAGE_SOURCES: SourceKind[] = ["claudeCode", "rooms", "network", "events"];

function groupOf(source: SourceKind): Group {
  return VILLAGE_SOURCES.includes(source) ? "village" : "transcripts";
}

function defaultSourceFor(group: Group): SourceKind {
  return group === "transcripts" ? "trees" : "claudeCode";
}

interface Props {
  rows: TranscriptSummary[];
  loadedChunks: number;
  totalChunks: number;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
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

const NEUTRAL_LANE = "var(--border)";

type Row =
  | { type: "divider"; key: string; label: string }
  | { type: "item"; key: string; row: TranscriptSummary };

export function Sidebar({ rows, loadedChunks, totalChunks, loading, hasMore, onLoadMore }: Props) {
  const source = useAppStore((s) => s.source);
  const changeSource = useAppStore((s) => s.changeSource);
  const selectedId = useAppStore((s) => s.selected?.id ?? null);
  const selectTranscript = useAppStore((s) => s.selectTranscript);
  const rooms = useAppStore((s) => s.rooms);
  const selectedRoomId = useAppStore((s) => s.selectedRoom?.id ?? null);
  const selectRoom = useAppStore((s) => s.selectRoom);
  const selectedEventIds = useAppStore((s) => s.selectedEventIds);
  const toggleEventSelection = useAppStore((s) => s.toggleEventSelection);
  const clearEventSelection = useAppStore((s) => s.clearEventSelection);
  const chatOpen = useAppStore((s) => s.chatOpen);
  const toggleChatOpen = useAppStore((s) => s.toggleChatOpen);
  const chatSelectionCount = useAppStore((s) => s.chatSelection.length);
  const manifest = useAppStore((s) => s.manifest);

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  const group = groupOf(source);

  useEffect(() => {
    setAgentFilter(null);
    setKindFilter(null);
    setQuery("");
  }, [source]);

  const availableKinds = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r.kindCounts)) seen.add(k);
    return Array.from(seen).sort();
  }, [rows]);

  const availableAgents = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) if (r.agentName) seen.add(r.agentName);
    return Array.from(seen).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = rows.filter((r) => {
      if (kindFilter && !(r.kindCounts[kindFilter] ?? 0)) {
        return false;
      }
      if (agentFilter && r.agentName !== agentFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.preview.toLowerCase().includes(q) ||
        (r.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
    return matches.slice().sort((a, b) => (chronoKey(a) < chronoKey(b) ? -1 : chronoKey(a) > chronoKey(b) ? 1 : 0));
  }, [rows, query, kindFilter, agentFilter]);

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

  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms
      .filter((r) => !q || (r.name ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [rooms, query]);

  const header = (
    <div className="sidebar-header">
      <h1>AI Village Transcripts</h1>
      <div className="group-toggle">
        <button
          className={group === "transcripts" ? "active" : ""}
          onClick={() => changeSource(defaultSourceFor("transcripts"))}
        >
          Transcripts
        </button>
        <button
          className={group === "village" ? "active" : ""}
          onClick={() => changeSource(defaultSourceFor("village"))}
        >
          Village
        </button>
        <button className={chatOpen ? "active" : ""} onClick={toggleChatOpen}>
          💬 Chat{chatSelectionCount > 0 ? ` (${chatSelectionCount})` : ""}
        </button>
      </div>
      <div className="source-toggle">
        {group === "transcripts" ? (
          <>
            <button className={source === "trees" ? "active" : ""} onClick={() => changeSource("trees")}>
              Attack chains ({(manifest?.trees.count ?? 0).toLocaleString()})
            </button>
            <button className={source === "orphans" ? "active" : ""} onClick={() => changeSource("orphans")}>
              Unanswered ({(manifest?.orphans.count ?? 0).toLocaleString()})
            </button>
          </>
        ) : (
          <>
            <button className={source === "claudeCode" ? "active" : ""} onClick={() => changeSource("claudeCode")}>
              Claude Code ({(manifest?.claudeCode.count ?? 0).toLocaleString()})
            </button>
            <button className={source === "network" ? "active" : ""} onClick={() => changeSource("network")}>
              Network
            </button>
            <button className={source === "rooms" ? "active" : ""} onClick={() => changeSource("rooms")}>
              Rooms ({rooms.length.toLocaleString()})
            </button>
            <button className={source === "events" ? "active" : ""} onClick={() => changeSource("events")}>
              Events ({(manifest?.events?.count ?? 0).toLocaleString()})
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (source === "network") {
    return (
      <aside className="sidebar">
        {header}
        <div className="sidebar-search">
          <p className="muted small">
            Undirected graph of every agent-to-agent @-mention found in chat_messages. Click a node in
            the main view to chat with an LLM about that agent, drag the slider to cut clutter from
            low-count edges.
          </p>
        </div>
      </aside>
    );
  }

  if (source === "rooms") {
    return (
      <aside className="sidebar">
        {header}

        <div className="sidebar-search">
          <input
            type="text"
            placeholder="Search room name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="sidebar-status">{filteredRooms.length.toLocaleString()} matching</div>

        <ul className="transcript-list">
          {filteredRooms.map((r) => (
            <SidebarRow
              key={r.id}
              selected={r.id === selectedRoomId}
              laneColor={laneColor(r.id)}
              onClick={() => selectRoom(r)}
              title={`#${r.name ?? r.id}`}
              badges={[
                {
                  key: "agents",
                  label: `${(r.whitelistedAgentNames ?? []).length} agents`,
                  className: "badge-system",
                },
              ]}
              preview={(r.whitelistedAgentNames ?? []).join(", ") || <em>open to all</em>}
            />
          ))}
        </ul>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      {header}

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
        {availableAgents.length > 0 && (
          <select
            className="agent-filter"
            value={agentFilter ?? ""}
            onChange={(e) => setAgentFilter(e.target.value || null)}
          >
            <option value="">All agents</option>
            {availableAgents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="sidebar-status">
        {loading
          ? `Loading index… ${loadedChunks}/${totalChunks} chunks (${rows.length.toLocaleString()} loaded)`
          : `${filtered.length.toLocaleString()} matching, oldest → newest${
              filtered.length > RENDER_CAP ? `, showing first ${RENDER_CAP}` : ""
            }`}
        {source === "events" && selectedEventIds.size > 0 && (
          <span className="selected-count">
            {" "}
            · {selectedEventIds.size} selected (in Chat) ·{" "}
            <button className="link-btn" onClick={clearEventSelection}>
              clear
            </button>
          </span>
        )}
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
          return (
            <SidebarRow
              key={entry.key}
              selected={r.id === selectedId}
              laneColor={r.agentId ? laneColor(r.agentId) : NEUTRAL_LANE}
              onClick={() => selectTranscript(r)}
              title={r.id}
              badges={Object.entries(r.kindCounts).map(([k, v]) => ({
                key: k,
                label: v,
                className: `badge-${k}`,
              }))}
              preview={r.preview || <em>(empty)</em>}
              checkbox={
                source === "events"
                  ? {
                      checked: selectedEventIds.has(r.id),
                      onChange: () => toggleEventSelection(r),
                      title: "Add to chat",
                    }
                  : undefined
              }
            />
          );
        })}
      </ul>
      {hasMore && (
        <button className="expand-btn sidebar-load-more" onClick={onLoadMore} disabled={loading}>
          {loading ? "Loading…" : `Load more (${loadedChunks}/${totalChunks} chunks fetched)`}
        </button>
      )}
    </aside>
  );
}
