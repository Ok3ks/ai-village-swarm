import { useMemo } from "react";
import { onActivateKey } from "../lib/a11y";
import type { TranscriptSummary } from "../lib/types";

const PX_PER_DAY = 22;
const ROW_H = 20;
const LEFT_PAD = 8;
const AXIS_H = 28;
const MIN_WIDTH = 600;
const MAX_POINTS = 4000;

function parseTs(s: string): number {
  return new Date(s.replace(" ", "T")).getTime();
}

function laneColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 60%)`;
}

function monthTicks(min: number, max: number): { x: number; label: string }[] {
  const ticks = [];
  const d = new Date(min);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() < min) d.setMonth(d.getMonth() + 1);
  for (let t = d.getTime(); t <= max; ) {
    ticks.push({ t });
    const next = new Date(t);
    next.setMonth(next.getMonth() + 1);
    t = next.getTime();
  }
  return ticks.map(({ t }) => ({
    x: t,
    label: new Date(t).toLocaleDateString(undefined, { month: "short", year: "numeric" }),
  }));
}

interface Props {
  rows: TranscriptSummary[];
  selectedId: string | null;
  onSelect: (s: TranscriptSummary) => void;
}

export function Timeline({ rows, selectedId, onSelect }: Props) {
  const allTimed = useMemo(
    () => rows.filter((r) => r.startTime && r.endTime) as (TranscriptSummary & { startTime: string; endTime: string })[],
    [rows]
  );

  // Sources like events can accumulate tens of thousands of rows -- render
  // one SVG node per row and the browser chokes. Downsample evenly rather
  // than silently truncating to the first/last N.
  const timed = useMemo(() => {
    if (allTimed.length <= MAX_POINTS) return allTimed;
    const step = Math.ceil(allTimed.length / MAX_POINTS);
    return allTimed.filter((_, i) => i % step === 0);
  }, [allTimed]);

  const { lanes, minT, maxT } = useMemo(() => {
    if (timed.length === 0) return { lanes: [] as { key: string; items: typeof timed }[], minT: 0, maxT: 1 };
    const byLane = new Map<string, typeof timed>();
    for (const r of timed) {
      const key = r.sdkSessionId ?? r.agentId ?? r.id;
      if (!byLane.has(key)) byLane.set(key, []);
      byLane.get(key)!.push(r);
    }
    for (const items of byLane.values()) items.sort((a, b) => parseTs(a.startTime) - parseTs(b.startTime));
    const lanes = Array.from(byLane.entries())
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => parseTs(a.items[0].startTime) - parseTs(b.items[0].startTime));
    const allT = timed.flatMap((r) => [parseTs(r.startTime), parseTs(r.endTime)]);
    return { lanes, minT: Math.min(...allT), maxT: Math.max(...allT) };
  }, [timed]);

  if (timed.length === 0) {
    return <div className="timeline-empty">No timestamped transcripts to plot for this source.</div>;
  }

  const span = Math.max(maxT - minT, 1);
  const width = Math.max(MIN_WIDTH, (span / 86400000) * PX_PER_DAY + LEFT_PAD * 2);
  const height = lanes.length * ROW_H + AXIS_H;
  const scaleX = (t: number) => LEFT_PAD + ((t - minT) / span) * (width - LEFT_PAD * 2);
  const ticks = monthTicks(minT, maxT);

  return (
    <div className="timeline-graph">
      {timed.length < allTimed.length && (
        <p className="muted small">
          Sampled {timed.length.toLocaleString()} of {allTimed.length.toLocaleString()} timestamped items for
          performance.
        </p>
      )}
      <svg width={width} height={height} role="img" aria-label="Transcript timeline">
        {ticks.map((tick) => (
          <g key={tick.label}>
            <line
              x1={scaleX(tick.x)}
              x2={scaleX(tick.x)}
              y1={AXIS_H}
              y2={height}
              className="timeline-gridline"
            />
            <text x={scaleX(tick.x) + 3} y={16} className="timeline-tick-label">
              {tick.label}
            </text>
          </g>
        ))}
        {lanes.map((lane, i) => {
          const y = AXIS_H + i * ROW_H + ROW_H / 2;
          const color = laneColor(lane.key);
          const points = lane.items.map((r) => `${scaleX(parseTs(r.startTime))},${y}`).join(" ");
          return (
            <g key={lane.key}>
              {lane.items.length > 1 && (
                <polyline points={points} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1.5} />
              )}
              {lane.items.map((r) => (
                <circle
                  key={r.id}
                  cx={scaleX(parseTs(r.startTime))}
                  cy={y}
                  r={r.id === selectedId ? 5.5 : 4}
                  fill={color}
                  stroke={r.id === selectedId ? "var(--text)" : color}
                  strokeWidth={r.id === selectedId ? 2 : 0}
                  className="timeline-node"
                  onClick={() => onSelect(r)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${r.id}, ${r.startTime}`}
                  aria-pressed={r.id === selectedId}
                  onKeyDown={onActivateKey(() => onSelect(r))}
                >
                  <title>
                    {r.id} · {r.startTime}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
