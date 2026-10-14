import { useEffect, useMemo, useState } from "react";
import { onActivateKey } from "../lib/a11y";
import { fetchRoomMessageChunk } from "../lib/api";
import { displayName, nodesByDegree } from "../lib/network";
import { useAppStore } from "../lib/store";
import type { Turn } from "../lib/types";
import { TurnCard } from "./TurnCard";

const SIZE = 640;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 90;
const TOP_LABELS_WHEN_IDLE = 10;
const DEFAULT_TOP_NODES_SHOWN = 15;

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("_");
}

function AgentPairThread({ aId, bId }: { aId: string; bId: string }) {
  const manifest = useAppStore((s) => s.manifest);
  const chatSelection = useAppStore((s) => s.chatSelection);
  const toggleChatSelection = useAppStore((s) => s.toggleChatSelection);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);

  const key = pairKey(aId, bId);
  const entry = manifest?.agentPairMessages?.[key];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const chunkFiles = entry?.chunkFiles ?? [];
    Promise.all(chunkFiles.map((f) => fetchRoomMessageChunk(f))).then((chunks) => {
      if (cancelled) return;
      setTurns(chunks.flat());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const isSelected = (id: string) => chatSelection.some((t) => t.id === id);
  const toggleSelect = (id: string) => {
    const turn = turns.find((t) => t.id === id);
    if (turn) toggleChatSelection(turn);
  };

  if (loading) return <p className="muted small">Loading conversation…</p>;
  if (turns.length === 0) return <p className="muted small">No direct @-mentions found between these two.</p>;

  return (
    <>
      {turns.map((t) => (
        <TurnCard key={t.id} turn={t} isRoot={false} selected={isSelected(t.id)} onToggleSelect={toggleSelect} />
      ))}
    </>
  );
}

export function NetworkGraph() {
  const edges = useAppStore((s) => s.agentComms);
  const agents = useAppStore((s) => s.agents);
  const openAgentChat = useAppStore((s) => s.openAgentChat);
  const nameById = useMemo(() => new Map(agents.map((a) => [a.id, a.name ?? a.id])), [agents]);
  const selectedId = useAppStore((s) => s.selectedNetworkNode);
  const setSelectedId = useAppStore((s) => s.selectNetworkNode);
  const [conversationWith, setConversationWith] = useState<string | null>(null);
  const [minCount, setMinCount] = useState(0);
  const [topNodesShown, setTopNodesShown] = useState(DEFAULT_TOP_NODES_SHOWN);

  // Selection can now change from the sidebar's node list too, not just a
  // graph click -- reset the conversation view whenever the selected node
  // changes, regardless of where that change came from.
  useEffect(() => {
    setConversationWith(null);
  }, [selectedId]);

  const { nodes, totalNodeCount, degree, maxCount } = useMemo(() => {
    const deg = new Map<string, number>();
    for (const e of edges) {
      deg.set(e.a, (deg.get(e.a) ?? 0) + e.count);
      deg.set(e.b, (deg.get(e.b) ?? 0) + e.count);
    }
    const ids = nodesByDegree(edges);
    const max = edges.reduce((m, e) => Math.max(m, e.count), 1);
    return { nodes: ids.slice(0, topNodesShown), totalNodeCount: ids.length, degree: deg, maxCount: max };
  }, [edges, topNodesShown]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    nodes.forEach((id, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
      map.set(id, { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) });
    });
    return map;
  }, [nodes]);

  const topByDegree = useMemo(
    () => new Set(nodes.slice(0, TOP_LABELS_WHEN_IDLE)),
    [nodes]
  );

  const neighborIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const set = new Set<string>();
    for (const e of edges) {
      if (e.a === selectedId) set.add(e.b);
      if (e.b === selectedId) set.add(e.a);
    }
    return set;
  }, [edges, selectedId]);

  const visibleEdges = edges.filter((e) => e.count >= minCount);

  if (nodes.length === 0) {
    return <p className="muted small">No @-mentions linking agents were found in chat_messages.</p>;
  }

  const selectedNeighborEdges = selectedId
    ? edges.filter((e) => e.a === selectedId || e.b === selectedId).sort((a, b) => b.count - a.count)
    : [];

  return (
    <div className="network-graph">
      <div className="network-controls">
        <label className="muted small">
          Min mentions: {minCount}
          <input
            type="range"
            min={0}
            max={maxCount}
            value={minCount}
            onChange={(e) => setMinCount(Number(e.target.value))}
          />
        </label>
        <label className="muted small" title="How many of the busiest nodes to draw on the graph">
          Nodes shown:
          <input
            type="number"
            min={1}
            max={totalNodeCount}
            value={topNodesShown}
            onChange={(e) => setTopNodesShown(Math.max(1, Math.min(totalNodeCount, Number(e.target.value) || 1)))}
            className="node-count-input"
          />
        </label>
        <span className="muted small">
          top {nodes.length} of {totalNodeCount.toLocaleString()} nodes · {visibleEdges.length} of{" "}
          {edges.length.toLocaleString()} edges shown
        </span>
        {selectedId && (
          <button className="expand-btn" onClick={() => setSelectedId(null)}>
            Clear selection
          </button>
        )}
      </div>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" role="img" aria-label="Agent communication network">
        {visibleEdges.map((e, i) => {
          const p1 = positions.get(e.a);
          const p2 = positions.get(e.b);
          if (!p1 || !p2) return null;
          const touchesSelected = selectedId && (e.a === selectedId || e.b === selectedId);
          const dim = selectedId && !touchesSelected;
          const nameA = displayName(e.a, nameById);
          const nameB = displayName(e.b, nameById);
          return (
            <line
              key={i}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="var(--accent)"
              strokeWidth={1 + (e.count / maxCount) * 6}
              strokeOpacity={dim ? 0.03 : touchesSelected ? 0.8 : 0.1 + (e.count / maxCount) * 0.4}
            >
              <title>
                {nameA} ↔ {nameB}: {e.count.toLocaleString()} mention(s)
              </title>
            </line>
          );
        })}
        {nodes.map((id) => {
          const p = positions.get(id);
          if (!p) return null;
          const name = displayName(id, nameById);
          const isSelected = id === selectedId;
          const isNeighbor = neighborIds.has(id);
          const showLabel = isSelected || isNeighbor || (!selectedId && topByDegree.has(id));
          const r = 5 + Math.min(10, ((degree.get(id) ?? 0) / maxCount) * 4);
          const activate = () => setSelectedId(isSelected ? null : id);
          return (
            <g
              key={id}
              className="network-node"
              onClick={activate}
              role="button"
              tabIndex={0}
              aria-label={`${name}, ${(degree.get(id) ?? 0).toLocaleString()} total mentions`}
              aria-pressed={isSelected}
              onKeyDown={onActivateKey(activate)}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill="var(--accent)"
                stroke={isSelected ? "var(--text)" : "var(--bg)"}
                strokeWidth={isSelected ? 3 : 2}
                opacity={selectedId && !isSelected && !isNeighbor ? 0.35 : 1}
              >
                <title>
                  {name}: {(degree.get(id) ?? 0).toLocaleString()} total mention(s)
                </title>
              </circle>
              {showLabel && (
                <text
                  x={p.x}
                  y={p.y + (p.y > CENTER ? 18 : -10)}
                  fontSize={10.5}
                  textAnchor="middle"
                  fill="var(--text)"
                  opacity={selectedId && !isSelected && !isNeighbor ? 0.35 : 1}
                >
                  {name.slice(0, 18)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {selectedId && (
        <div className="network-detail">
          <div className="turn-header">
            <span className="turn-role">
              {conversationWith
                ? `${displayName(selectedId, nameById)} ↔ ${displayName(conversationWith, nameById)}`
                : displayName(selectedId, nameById)}
            </span>
            {conversationWith ? (
              <button className="copy-btn" onClick={() => setConversationWith(null)}>
                back to correspondents
              </button>
            ) : (
              nameById.has(selectedId) && (
                <button className="copy-btn" onClick={() => openAgentChat(selectedId)}>
                  chat about agent
                </button>
              )
            )}
          </div>
          {conversationWith ? (
            <AgentPairThread aId={selectedId} bId={conversationWith} />
          ) : (
            <table className="classify-table">
              <thead>
                <tr>
                  <th>Correspondent</th>
                  <th>Mentions</th>
                </tr>
              </thead>
              <tbody>
                {selectedNeighborEdges.map((e) => {
                  const otherId = e.a === selectedId ? e.b : e.a;
                  return (
                    <tr
                      key={otherId}
                      className="clickable-row"
                      onClick={() => setConversationWith(otherId)}
                      title="View the conversation between these two agents"
                    >
                      <td>{displayName(otherId, nameById)}</td>
                      <td>{e.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
