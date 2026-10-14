import { useEffect, useMemo, useState } from "react";
import { displayName, nodeDegrees, nodesByDegree } from "../lib/network";
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

// No legend maps a per-agent/per-room hash color to meaning, so every row
// uses one consistent lane color instead of one hue per id.
const NEUTRAL_LANE = "var(--accent)";

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
  const selectedAgentFeed = useAppStore((s) => s.selectedAgentFeed);
  const selectAgentFeed = useAppStore((s) => s.selectAgentFeed);
  const eventsViewMode = useAppStore((s) => s.eventsViewMode);
  const setEventsViewMode = useAppStore((s) => s.setEventsViewMode);
  const agentComms = useAppStore((s) => s.agentComms);
  const agents = useAppStore((s) => s.agents);
  const selectedNetworkNode = useAppStore((s) => s.selectedNetworkNode);
  const selectNetworkNode = useAppStore((s) => s.selectNetworkNode);
  const manifest = useAppStore((s) => s.manifest);

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  // Agents tab's Chronological mode uses multi-select checkboxes instead of
  // the single-select chips the other tabs share.
  const [kindFilters, setKindFilters] = useState<Set<string>>(new Set());
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  const group = groupOf(source);

  useEffect(() => {
    setAgentFilter(null);
    setKindFilter(null);
    setKindFilters(new Set());
    setQuery("");
  }, [source]);

  const toggleKindFilter = (k: string) => {
    setKindFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

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
      if (source === "events") {
        if (kindFilters.size > 0 && ![...kindFilters].some((k) => r.kindCounts[k] ?? 0)) return false;
      } else if (kindFilter && !(r.kindCounts[kindFilter] ?? 0)) {
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
  }, [rows, query, kindFilter, kindFilters, agentFilter, source]);

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

  // The Agents tab lists one row per agent (busiest first, same ordering
  // Network uses for its nodes) instead of a flat per-event stream; clicking
  // an agent shows all of their events together in the main pane.
  const agentSummaries = useMemo(() => {
    if (source !== "events") return [];
    const byAgent = new Map<string, TranscriptSummary[]>();
    for (const r of rows) {
      const key = r.agentName ?? "Unknown agent";
      if (!byAgent.has(key)) byAgent.set(key, []);
      byAgent.get(key)!.push(r);
    }
    const q = query.trim().toLowerCase();
    return Array.from(byAgent.entries())
      .filter(([name]) => !q || name.toLowerCase().includes(q))
      .map(([name, agentRows]) => ({
        name,
        rows: agentRows,
        lastActive: agentRows.reduce((max, r) => (r.startTime && r.startTime > max ? r.startTime : max), ""),
      }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [rows, query, source]);

  // The graph itself gets unreadable once there are enough nodes/edges
  // (e.g. after human @-mentions started counting too) -- this list is a
  // decluttered way to find and select a node without hunting through the
  // SVG, same busiest-first ordering as the graph's own layout.
  const networkNodes = useMemo(() => {
    if (source !== "network") return [];
    const degree = nodeDegrees(agentComms);
    const nameById = new Map(agents.map((a) => [a.id, a.name ?? a.id]));
    const q = query.trim().toLowerCase();
    return nodesByDegree(agentComms)
      .map((id) => ({ id, name: displayName(id, nameById), count: degree.get(id) ?? 0 }))
      .filter((n) => !q || n.name.toLowerCase().includes(q));
  }, [agentComms, agents, query, source]);

  // Shared by the generic (trees/orphans/claudeCode) list and the Agents
  // tab's "Chronological" mode -- a flat, searchable, date-divided per-item
  // list, as opposed to the Agents tab's default per-agent grouping.
  const chronologicalList = (
    <>
      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search id, text, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {availableKinds.length > 0 &&
          (source === "events" ? (
            <div className="kind-checkboxes">
              {availableKinds.map((k) => (
                <label key={k} className="kind-checkbox">
                  <input
                    type="checkbox"
                    checked={kindFilters.has(k)}
                    onChange={() => toggleKindFilter(k)}
                  />
                  {k}
                </label>
              ))}
            </div>
          ) : (
            <div className="kind-chips">
              {availableKinds.map((k) => (
                <button
                  key={k}
                  className={`chip chip-${k} ${kindFilter === k ? "active" : ""}`}
                  onClick={() => setKindFilter(kindFilter === k ? null : k)}
                  title={kindFilter === k ? `Clear "${k}" filter` : `Filter to rows containing a "${k}" event`}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}
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
          return (
            <SidebarRow
              key={entry.key}
              selected={r.id === selectedId}
              laneColor={NEUTRAL_LANE}
              onClick={() => selectTranscript(r)}
              title={r.id}
              tooltip={`${r.id} — ${r.preview}${r.startTime ? ` @ ${r.startTime}` : ""}`}
              badges={Object.entries(r.kindCounts).map(([k, v]) => ({
                key: k,
                label: v,
                className: `badge-${k}`,
              }))}
              preview={r.preview || <em>(empty)</em>}
            />
          );
        })}
      </ul>
      {hasMore && (
        <button className="expand-btn sidebar-load-more" onClick={onLoadMore} disabled={loading}>
          {loading ? "Loading…" : `Load more (${loadedChunks}/${totalChunks} chunks fetched)`}
        </button>
      )}
    </>
  );

  const header = (
    <div className="sidebar-header">
      <h1>AI Village Transcripts</h1>
      <div className="group-toggle">
        <button
          className={group === "transcripts" ? "active" : ""}
          onClick={() => changeSource(defaultSourceFor("transcripts"))}
          title="The swarmtraces attack corpus (attack chains and unanswered payloads)"
        >
          Transcripts
        </button>
        <button
          className={group === "village" ? "active" : ""}
          onClick={() => changeSource(defaultSourceFor("village"))}
          title="This village's own activity log (agent sessions, rooms, events, network)"
        >
          Village
        </button>
      </div>
      <div className="source-toggle">
        {group === "transcripts" ? (
          <>
            <button
              className={source === "trees" ? "active" : ""}
              onClick={() => changeSource("trees")}
              title="Payload → response chains forming a complete attack tree"
            >
              Attack chains ({(manifest?.trees.count ?? 0).toLocaleString()})
            </button>
            <button
              className={source === "orphans" ? "active" : ""}
              onClick={() => changeSource("orphans")}
              title="Payloads with no matching response found"
            >
              Unanswered ({(manifest?.orphans.count ?? 0).toLocaleString()})
            </button>
          </>
        ) : (
          <>
            <button
              className={source === "claudeCode" ? "active" : ""}
              onClick={() => changeSource("claudeCode")}
              title="Transcripts of agents running Claude Code inside the village"
            >
              Claude Code ({(manifest?.claudeCode.count ?? 0).toLocaleString()})
            </button>
            <button
              className={source === "network" ? "active" : ""}
              onClick={() => changeSource("network")}
              title="Graph of agent-to-agent @-mentions"
            >
              Network
            </button>
            <button
              className={source === "rooms" ? "active" : ""}
              onClick={() => changeSource("rooms")}
              title="Chat rooms agents communicate in"
            >
              Rooms ({rooms.length.toLocaleString()})
            </button>
            <button
              className={source === "events" ? "active" : ""}
              onClick={() => changeSource("events")}
              title="All agents and their associated events (talk, wait, and other actions)"
            >
              Agents
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
          <input
            type="text"
            placeholder="Search agent/name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="sidebar-status">{networkNodes.length.toLocaleString()} node(s), busiest first</div>

        <ul className="transcript-list">
          {networkNodes.map((n) => (
            <SidebarRow
              key={n.id}
              selected={n.id === selectedNetworkNode}
              laneColor={NEUTRAL_LANE}
              onClick={() => selectNetworkNode(n.id === selectedNetworkNode ? null : n.id)}
              title={n.name}
              tooltip={`${n.name} — ${n.count.toLocaleString()} total mention(s)`}
              badges={[{ key: "count", label: `${n.count.toLocaleString()} mentions` }]}
              preview={<em>—</em>}
            />
          ))}
        </ul>
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
              laneColor={NEUTRAL_LANE}
              onClick={() => selectRoom(r)}
              title={`#${r.name ?? r.id}`}
              tooltip={`#${r.name ?? r.id} — ${(r.whitelistedAgentNames ?? []).join(", ") || "open to all"}`}
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

  if (source === "events") {
    return (
      <aside className="sidebar">
        {header}

        <div className="view-mode-toggle">
          <button
            className={eventsViewMode === "agent" ? "active" : ""}
            onClick={() => setEventsViewMode("agent")}
            title="Group events by agent"
          >
            By agent
          </button>
          <button
            className={eventsViewMode === "chronological" ? "active" : ""}
            onClick={() => setEventsViewMode("chronological")}
            title="Flat, time-ordered list of individual events"
          >
            Chronological
          </button>
        </div>

        {eventsViewMode === "chronological" ? (
          chronologicalList
        ) : (
          <>
            <div className="sidebar-search">
              <input
                type="text"
                placeholder="Search agent name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="sidebar-status">{agentSummaries.length.toLocaleString()} agent(s)</div>

            <ul className="transcript-list">
              {agentSummaries.map((a) => (
                <SidebarRow
                  key={a.name}
                  selected={a.name === selectedAgentFeed}
                  laneColor={NEUTRAL_LANE}
                  onClick={() => selectAgentFeed(a.name)}
                  title={a.name}
                  tooltip={`${a.name} — ${a.rows.length} event(s)${
                    a.lastActive ? `, last active ${a.lastActive}` : ""
                  }`}
                  badges={[{ key: "count", label: `${a.rows.length} events` }]}
                  preview={a.lastActive ? `Last active ${a.lastActive}` : <em>no timestamped events</em>}
                />
              ))}
            </ul>
          </>
        )}
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      {header}
      {chronologicalList}
    </aside>
  );
}
