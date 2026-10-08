import { useMemo, useState } from "react";
import { onActivateKey } from "../lib/a11y";
import { useAppStore } from "../lib/store";

const SIZE = 640;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 90;
const TOP_LABELS_WHEN_IDLE = 10;

function laneColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 60%)`;
}

export function NetworkGraph() {
  const edges = useAppStore((s) => s.agentComms);
  const agents = useAppStore((s) => s.agents);
  const openAgentChat = useAppStore((s) => s.openAgentChat);
  const nameById = useMemo(() => new Map(agents.map((a) => [a.id, a.name ?? a.id])), [agents]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [minCount, setMinCount] = useState(0);

  const { nodes, degree, maxCount } = useMemo(() => {
    const deg = new Map<string, number>();
    for (const e of edges) {
      deg.set(e.a, (deg.get(e.a) ?? 0) + e.count);
      deg.set(e.b, (deg.get(e.b) ?? 0) + e.count);
    }
    const ids = Array.from(deg.keys()).sort((a, b) => (deg.get(b) ?? 0) - (deg.get(a) ?? 0));
    const max = edges.reduce((m, e) => Math.max(m, e.count), 1);
    return { nodes: ids, degree: deg, maxCount: max };
  }, [edges]);

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
        <span className="muted small">
          {nodes.length} agents · {visibleEdges.length} of {edges.length} edges shown
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
            />
          );
        })}
        {nodes.map((id) => {
          const p = positions.get(id);
          if (!p) return null;
          const name = nameById.get(id) ?? id;
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
                fill={laneColor(id)}
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
            <span className="turn-role">{nameById.get(selectedId) ?? selectedId}</span>
            <button className="copy-btn" onClick={() => openAgentChat(selectedId)}>
              chat about agent
            </button>
          </div>
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
                  <tr key={otherId}>
                    <td>{nameById.get(otherId) ?? otherId}</td>
                    <td>{e.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
