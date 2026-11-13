import { useEffect, useMemo, useState } from "react";
import { onActivateKey } from "../lib/a11y";
import { fetchText } from "../lib/api";
import {
  allMemories,
  configItems,
  configTurn,
  findNode,
  formatBytes,
  memoryLinks,
  memoryTurn,
  pathAncestors,
  promptTurn,
  sessionSummary,
  squarify,
} from "../lib/claudeHome";
import { useAppStore } from "../lib/store";
import type { ClaudeHome, ClaudeProject, ClaudeTreeNode, Sensitivity, Turn } from "../lib/types";
import { TranscriptThread } from "./TranscriptThread";
import { TurnCard } from "./TurnCard";

const MAP_W = 900;
const MAP_H = 480;
const CHART_W = 900;
const PROMPT_PAGE = 50;

const SENSITIVITY_HINT: Record<Sensitivity, string> = {
  secret: "Credentials, auth state or environment captures -- don't share or screenshot",
  personal: "Your own prompts, transcripts, pastes or file contents",
};

export function SensitiveLabel({ level }: { level: Sensitivity | undefined }) {
  if (!level) return null;
  return (
    <span className="badge badge-sensitive" title={SENSITIVITY_HINT[level]}>
      sensitive · {level}
    </span>
  );
}

/**
 * Labelled content block for sensitive text. Secrets start blurred and need
 * a deliberate click to show; they also never get a chat checkbox, so they
 * can't be sent to an LLM by accident.
 */
function SensitiveText({ level, title, text }: { level: Sensitivity | undefined; title: string; text: string }) {
  const [revealed, setRevealed] = useState(level !== "secret");
  return (
    <div className={level ? "sensitive-block" : "turn-card"}>
      <div className="turn-header">
        <span className="turn-role">{title}</span>
        <SensitiveLabel level={level} />
        {level === "secret" && (
          <button className="copy-btn turn-time" onClick={() => setRevealed((r) => !r)}>
            {revealed ? "hide" : "reveal"}
          </button>
        )}
      </div>
      <pre className={`turn-text ${revealed ? "" : "concealed"}`} aria-hidden={!revealed}>
        {text || "(empty file)"}
      </pre>
    </div>
  );
}

function FileContent({ node }: { node: ClaudeTreeNode }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!node.contentFile) return;
    let cancelled = false;
    fetchText(node.contentFile)
      .then((t) => !cancelled && setText(t))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [node.contentFile]);

  if (!node.contentFile) {
    return (
      <p className="muted small">
        {node.folded
          ? "Folded entries aren't listed individually."
          : "Contents not exported (binary, over 1 MB, a session transcript — see Projects — or exported with --no-sensitive)."}
      </p>
    );
  }
  if (error) return <p className="error small">{error}</p>;
  if (text === null) return <p className="muted small">Loading…</p>;
  return <SensitiveText key={node.path} level={node.sensitivity} title={node.name} text={text} />;
}

function useChatToggle() {
  const chatSelection = useAppStore((s) => s.chatSelection);
  const toggleChatSelection = useAppStore((s) => s.toggleChatSelection);
  return {
    isSelected: (id: string) => chatSelection.some((t) => t.id === id),
    toggle: (turn: Turn) => toggleChatSelection(turn),
  };
}

// ---------- Structure: treemap of the directory ----------

function StructureView({ home }: { home: ClaudeHome }) {
  const selected = useAppStore((s) => s.selectedClaudeItem);
  const select = useAppStore((s) => s.selectClaudeItem);

  const node = findNode(home.tree, selected) ?? home.tree;
  // A file has nothing to subdivide -- keep showing its directory, with the
  // file highlighted.
  const parentPath = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : "";
  const container = node.children ? node : (findNode(home.tree, parentPath) ?? home.tree);
  const rects = useMemo(() => squarify(container.children ?? [], 0, 0, MAP_W, MAP_H), [container]);
  const maxBytes = Math.max(1, ...rects.map((r) => r.node.bytes));
  const rootLabel = home.root.replace(/^\/Users\/[^/]+/, "~");
  const description = home.tree.children?.find((c) => c.name === node.path.split("/")[0])?.description;

  return (
    <div className="network-graph">
      <div className="network-controls">
        <nav className="breadcrumb" aria-label="Directory path">
          {pathAncestors(container.path).map((p) => (
            <button key={p} className="link-btn" onClick={() => select(p || null)}>
              {p ? p.split("/").pop() : rootLabel}
            </button>
          ))}
        </nav>
        <span className="muted small">
          {formatBytes(container.bytes)} · {container.files.toLocaleString()} file(s) · area = size on disk
        </span>
      </div>

      {rects.length === 0 ? (
        <p className="muted small">Nothing with a size to draw here.</p>
      ) : (
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width="100%" role="img" aria-label={`Treemap of ${container.path || "~/.claude"}`}>
          <defs>
            {rects.map((r, i) => (
              <clipPath key={r.node.path} id={`treemap-clip-${i}`}>
                <rect x={r.x} y={r.y} width={Math.max(0, r.w - 6)} height={Math.max(0, r.h)} />
              </clipPath>
            ))}
          </defs>
          {rects.map((r, i) => {
            const drillable = !!r.node.children?.length;
            const isSelected = r.node.path === node.path && node !== container;
            const activate = () => select(r.node.path);
            const showLabel = r.w > 70 && r.h > 22;
            return (
              <g
                key={r.node.path}
                className="treemap-cell"
                onClick={activate}
                role="button"
                tabIndex={0}
                aria-label={`${r.node.name}, ${formatBytes(r.node.bytes)}`}
                onKeyDown={onActivateKey(activate)}
              >
                <rect
                  x={r.x}
                  y={r.y}
                  width={Math.max(0, r.w)}
                  height={Math.max(0, r.h)}
                  fill="var(--accent)"
                  fillOpacity={0.12 + 0.55 * Math.sqrt(r.node.bytes / maxBytes)}
                  stroke={isSelected ? "var(--text)" : "var(--bg)"}
                  strokeWidth={isSelected ? 3 : 2}
                >
                  <title>
                    {r.node.name} — {formatBytes(r.node.bytes)}, {r.node.files.toLocaleString()} file(s)
                    {r.node.sensitivity ? ` · sensitive (${r.node.sensitivity})` : ""}
                    {drillable ? " (click to open)" : ""}
                  </title>
                </rect>
                {showLabel && (
                  <g clipPath={`url(#treemap-clip-${i})`}>
                    <text x={r.x + 8} y={r.y + 18} fontSize={13} fontWeight={600} fill="var(--text)">
                      {r.node.name}
                      {drillable ? "/" : ""}
                    </text>
                    {r.h > 40 && (
                      <text x={r.x + 8} y={r.y + 34} fontSize={11} fill="var(--text-muted)">
                        {formatBytes(r.node.bytes)}
                        {r.node.sensitivity && <tspan fill="#ff9b9b"> · {r.node.sensitivity}</tspan>}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}

      <div className="network-detail">
        <div className="turn-header">
          <span className="turn-role">{node.path || rootLabel}</span>
          <SensitiveLabel level={node.sensitivity} />
        </div>
        <dl className="agent-fields">
          {description && (
            <>
              <dt>What it is</dt>
              <dd>{description}</dd>
            </>
          )}
          <dt>Size</dt>
          <dd>
            {formatBytes(node.bytes)} · {node.files.toLocaleString()} file(s)
          </dd>
          {node.mtime && (
            <>
              <dt>Last modified</dt>
              <dd>{node.mtime}</dd>
            </>
          )}
        </dl>
        {node.children && node.children.length > 0 && <ChildTable nodes={node.children} onSelect={select} />}
      </div>

      {!node.isDir && node.path && <FileContent node={node} />}
    </div>
  );
}

function ChildTable({ nodes, onSelect }: { nodes: ClaudeTreeNode[]; onSelect: (p: string) => void }) {
  return (
    <table className="classify-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Sensitivity</th>
          <th>Size</th>
          <th>Files</th>
          <th>Modified</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((c) => (
          <tr key={c.path} className="clickable-row" onClick={() => onSelect(c.path)}>
            <td>
              {c.name}
              {c.children ? "/" : ""}
            </td>
            <td>
              <SensitiveLabel level={c.sensitivity} />
            </td>
            <td>{formatBytes(c.bytes)}</td>
            <td>{c.files.toLocaleString()}</td>
            <td>{c.mtime ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- Projects: activity, sessions, memories ----------

/** Daily bar chart over the full date range (gaps included, so idle stretches show). */
function ActivityChart({ byDay, label }: { byDay: Record<string, number>; label: string }) {
  const days = useMemo(() => {
    const keys = Object.keys(byDay).sort();
    if (keys.length === 0) return [];
    const out: string[] = [];
    const end = new Date(`${keys[keys.length - 1]}T00:00:00Z`);
    for (let d = new Date(`${keys[0]}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }, [byDay]);

  if (days.length === 0) return <p className="muted small">No prompts recorded in history.jsonl.</p>;

  const h = 120;
  const max = Math.max(1, ...days.map((d) => byDay[d] ?? 0));
  const bw = CHART_W / days.length;
  return (
    <figure className="activity-chart">
      <svg viewBox={`0 0 ${CHART_W} ${h + 18}`} width="100%" role="img" aria-label={label}>
        {days.map((d, i) => {
          const v = byDay[d] ?? 0;
          const bh = (v / max) * h;
          return (
            <rect key={d} x={i * bw + 0.5} y={h - bh} width={Math.max(1, bw - 1)} height={bh} fill="var(--accent)">
              <title>
                {d}: {v} prompt(s)
              </title>
            </rect>
          );
        })}
        <line x1={0} y1={h} x2={CHART_W} y2={h} stroke="var(--border)" />
        <text x={0} y={h + 14} fontSize={11} fill="var(--text-muted)">
          {days[0]}
        </text>
        <text x={CHART_W} y={h + 14} fontSize={11} fill="var(--text-muted)" textAnchor="end">
          {days[days.length - 1]}
        </text>
      </svg>
      <figcaption className="muted small">
        {label} · peak {max} on {days.find((d) => byDay[d] === max)}
      </figcaption>
    </figure>
  );
}

function ProjectsOverview({ home }: { home: ClaudeHome }) {
  const select = useAppStore((s) => s.selectClaudeItem);
  const projects = [...home.projects].sort((a, b) => b.promptCount - a.promptCount);
  const max = Math.max(1, ...projects.map((p) => p.promptCount));
  const allByDay = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const p of home.projects) for (const [d, v] of Object.entries(p.promptsByDay)) acc[d] = (acc[d] ?? 0) + v;
    return acc;
  }, [home]);

  const rowH = 30;
  const labelW = 200;
  return (
    <div className="network-graph">
      <ActivityChart byDay={allByDay} label="Prompts per day, all projects" />
      <svg
        viewBox={`0 0 ${CHART_W} ${projects.length * rowH}`}
        width="100%"
        role="img"
        aria-label="Prompts per project"
      >
        {projects.map((p, i) => {
          // Leave room right of the longest bar for its count label.
          const bw = ((CHART_W - labelW - 340) * p.promptCount) / max;
          const activate = () => select(p.slug);
          return (
            <g
              key={p.slug}
              className="treemap-cell"
              onClick={activate}
              role="button"
              tabIndex={0}
              aria-label={`${p.name}: ${p.promptCount} prompts`}
              onKeyDown={onActivateKey(activate)}
            >
              <text x={labelW - 10} y={i * rowH + 19} fontSize={13} textAnchor="end" fill="var(--text)">
                {p.name.slice(0, 26)}
              </text>
              <rect x={labelW} y={i * rowH + 5} width={Math.max(2, bw)} height={rowH - 10} rx={3} fill="var(--accent)">
                <title>{p.path}</title>
              </rect>
              <text x={labelW + bw + 8} y={i * rowH + 19} fontSize={12} fill="var(--text-muted)">
                {p.promptCount.toLocaleString()} prompts · {p.sessionCount} sessions · {p.memories.length} memories
              </text>
            </g>
          );
        })}
      </svg>
      <p className="muted small">Select a project to see its sessions and memories.</p>
    </div>
  );
}

function ProjectDetail({ project, onOpenSession }: { project: ClaudeProject; onOpenSession: (id: string) => void }) {
  const { isSelected, toggle } = useChatToggle();
  const sensitive = useAppStore((s) => s.claudeSensitive);
  const [promptsShown, setPromptsShown] = useState(PROMPT_PAGE);
  const memoryTurns = project.memories.map((m) => memoryTurn(project, m));
  // Newest first, matching the sessions table.
  const prompts = useMemo(
    () => (sensitive?.prompts[project.slug] ?? []).map((p, i) => promptTurn(project, p, i)).reverse(),
    [sensitive, project]
  );
  const subagentCount = project.sessions.length - project.sessionCount;

  return (
    <>
      <div className="turn-card turn-root">
        <div className="turn-header">
          <span className="turn-role">{project.name}</span>
          <span className="turn-cite turn-time">{project.lastActive ? `last active ${project.lastActive}` : ""}</span>
        </div>
        <dl className="agent-fields">
          <dt>Path</dt>
          <dd>{project.path}</dd>
          <dt>Activity</dt>
          <dd>
            {project.promptCount.toLocaleString()} prompt(s) · {project.sessionCount} session transcript(s)
            {subagentCount > 0 ? ` + ${subagentCount} subagent(s)` : ""} ·{" "}
            {project.memories.length} memory file(s) · {formatBytes(project.bytes)} on disk
          </dd>
        </dl>
      </div>

      <ActivityChart byDay={project.promptsByDay} label="Prompts per day" />

      {project.sessions.length > 0 && (
        <>
        <h3 className="section-title">
          Sessions <SensitiveLabel level="personal" />
        </h3>
        <table className="classify-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Title</th>
              <th>Started</th>
              <th>Ended</th>
              <th>Messages (user / assistant)</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {project.sessions.map((s) => (
              <tr
                key={s.id}
                className={`${s.file ? "clickable-row" : ""} ${s.parentId ? "session-row-sub" : ""}`}
                onClick={s.file ? () => onOpenSession(s.id) : undefined}
                title={s.file ? "Open the full transcript" : "Transcript not exported (run without --no-sensitive)"}
              >
                <td title={s.id}>
                  {s.parentId ? "↳ " : ""}
                  {s.parentId ? (s.agentType ?? "subagent") : s.id.slice(0, 8)}
                </td>
                <td>{s.title ?? <em className="muted">untitled</em>}</td>
                <td>{s.start}</td>
                <td>{s.end}</td>
                <td>
                  {s.messages.toLocaleString()} ({s.userMessages} / {s.assistantMessages})
                </td>
                <td>{formatBytes(s.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}

      {sensitive && (
        <>
          <h3 className="section-title">
            Prompts ({prompts.length.toLocaleString()}) <SensitiveLabel level="personal" />
          </h3>
          {prompts.length === 0 ? (
            <p className="muted small">No prompts in history.jsonl for this project.</p>
          ) : (
            <>
              {prompts.slice(0, promptsShown).map((t) => (
                <TurnCard key={t.id} turn={t} isRoot={false} selected={isSelected(t.id)} onToggleSelect={() => toggle(t)} />
              ))}
              {promptsShown < prompts.length && (
                <button className="expand-btn" onClick={() => setPromptsShown((n) => n + PROMPT_PAGE)}>
                  Show {Math.min(PROMPT_PAGE, prompts.length - promptsShown)} more ({prompts.length - promptsShown}{" "}
                  remaining)
                </button>
              )}
            </>
          )}
        </>
      )}

      <h3 className="section-title">Memories</h3>
      {memoryTurns.length === 0 ? (
        <p className="muted small">No memories saved for this project.</p>
      ) : (
        <>
          <p className="muted small">{memoryTurns.length} memory file(s) · tick to discuss in chat</p>
          {memoryTurns.map((t) => (
            <TurnCard key={t.id} turn={t} isRoot={false} selected={isSelected(t.id)} onToggleSelect={() => toggle(t)} />
          ))}
        </>
      )}
    </>
  );
}

// ---------- Preferences: memories graph + settings ----------

const PREF_SIZE = 640;
const PREF_CENTER = PREF_SIZE / 2;
const PREF_RADIUS = PREF_SIZE / 2 - 130;

function PreferencesView({ home }: { home: ClaudeHome }) {
  const selected = useAppStore((s) => s.selectedClaudeItem);
  const select = useAppStore((s) => s.selectClaudeItem);
  const { isSelected, toggle } = useChatToggle();
  const entries = useMemo(() => allMemories(home), [home]);
  const edges = useMemo(() => memoryLinks(entries), [entries]);

  // Around the circle grouped by project, so each project's memories sit together.
  const positions = useMemo(() => {
    const ordered = [...entries].sort(
      (a, b) => a.project.name.localeCompare(b.project.name) || a.memory.name.localeCompare(b.memory.name)
    );
    const map = new Map<string, { x: number; y: number; angle: number }>();
    ordered.forEach((e, i) => {
      const angle = (i / ordered.length) * 2 * Math.PI - Math.PI / 2;
      map.set(e.id, { x: PREF_CENTER + PREF_RADIUS * Math.cos(angle), y: PREF_CENTER + PREF_RADIUS * Math.sin(angle), angle });
    });
    return map;
  }, [entries]);

  const current = entries.find((e) => e.id === selected);
  const neighbours = new Set(
    edges.flatMap(([a, b]) => (a === selected ? [b] : b === selected ? [a] : []))
  );
  const linked = entries.filter((e) => neighbours.has(e.id));
  const settings = home.settings.find((s) => s.file === "settings.json")?.settings ?? {};
  const prefCount = entries.filter((e) => e.isPreference).length;

  return (
    <div className="network-graph">
      <div className="turn-card turn-root">
        <div className="turn-header">
          <span className="turn-role">Your preferences</span>
          <span className="turn-cite turn-time">
            {prefCount} saved preference(s) across {new Set(entries.filter((e) => e.isPreference).map((e) => e.project.slug)).size}{" "}
            project(s)
          </span>
        </div>
        <dl className="agent-fields settings-summary">
          {Object.entries(settings).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{typeof v === "string" ? v : JSON.stringify(v)}</dd>
            </div>
          ))}
        </dl>
      </div>

      {entries.length === 0 ? (
        <p className="muted small">No memories saved in any project yet.</p>
      ) : (
        <>
          <p className="muted small">
            Saved memories and the [[links]] between them · filled = preference (feedback / user), hollow = project
            or reference note · click to read
          </p>
          <svg viewBox={`-90 -60 ${PREF_SIZE + 180} ${PREF_SIZE + 120}`} width="100%" className="pref-graph" role="img" aria-label="Memory link graph">
            {edges.map(([a, b]) => {
              const p1 = positions.get(a);
              const p2 = positions.get(b);
              if (!p1 || !p2) return null;
              const touches = a === selected || b === selected;
              return (
                <line
                  key={`${a}|${b}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="var(--accent)"
                  strokeWidth={touches ? 2.5 : 1.2}
                  strokeOpacity={selected ? (touches ? 0.9 : 0.08) : 0.45}
                />
              );
            })}
            {entries.map((e) => {
              const p = positions.get(e.id);
              if (!p) return null;
              const isSel = e.id === selected;
              const dim = selected && !isSel && !neighbours.has(e.id);
              const right = Math.cos(p.angle) >= 0;
              const deg = (p.angle * 180) / Math.PI;
              const activate = () => select(isSel ? null : e.id);
              return (
                <g
                  key={e.id}
                  className="network-node"
                  onClick={activate}
                  role="button"
                  tabIndex={0}
                  aria-label={`${e.memory.name}, ${e.memory.type}, ${e.project.name}`}
                  aria-pressed={isSel}
                  onKeyDown={onActivateKey(activate)}
                  opacity={dim ? 0.3 : 1}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSel ? 9 : 7}
                    fill={e.isPreference ? "var(--accent)" : "var(--bg)"}
                    stroke={isSel ? "var(--text)" : "var(--accent)"}
                    strokeWidth={2}
                  >
                    <title>
                      {e.memory.name} ({e.memory.type}, {e.project.name}) — {e.memory.description}
                    </title>
                  </circle>
                  <text
                    x={p.x + (right ? 12 : -12)}
                    y={p.y + 4}
                    fontSize={11}
                    textAnchor={right ? "start" : "end"}
                    fill={e.isPreference ? "var(--text)" : "var(--text-muted)"}
                    transform={`rotate(${right ? deg : deg + 180} ${p.x} ${p.y})`}
                  >
                    {e.memory.name.slice(0, 26)}
                  </text>
                </g>
              );
            })}
          </svg>
        </>
      )}

      {current ? (
        <>
          <p className="muted small">
            From <strong>{current.project.name}</strong> ({current.project.path})
          </p>
          {(() => {
            const t = memoryTurn(current.project, current.memory);
            return <TurnCard turn={t} isRoot selected={isSelected(t.id)} onToggleSelect={() => toggle(t)} />;
          })()}
          {linked.length > 0 && (
            <table className="classify-table">
              <thead>
                <tr>
                  <th>Linked memory</th>
                  <th>Type</th>
                  <th>Project</th>
                </tr>
              </thead>
              <tbody>
                {linked.map((e) => (
                  <tr key={e.id} className="clickable-row" onClick={() => select(e.id)}>
                    <td>{e.memory.name}</td>
                    <td>{e.memory.type}</td>
                    <td>{e.project.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        entries
          .filter((e) => e.isPreference)
          .map((e) => {
            const t = memoryTurn(e.project, e.memory);
            return (
              <TurnCard key={t.id} turn={t} isRoot={false} selected={isSelected(t.id)} onToggleSelect={() => toggle(t)} />
            );
          })
      )}
    </div>
  );
}

// ---------- Config: settings, skills, plugins, plans ----------

function ConfigView({ home }: { home: ClaudeHome }) {
  const selected = useAppStore((s) => s.selectedClaudeItem);
  const { isSelected, toggle } = useChatToggle();
  const sensitive = useAppStore((s) => s.claudeSensitive);
  const items = useMemo(() => configItems(home), [home]);
  // Settings are the natural landing page -- show them until something else is picked.
  const item = items.find((i) => i.id === selected) ?? items[0];
  if (!item) return <p className="muted small">No settings, skills, plugins or plans found.</p>;
  const turn = configTurn(item);
  const raw =
    item.kind === "settings" ? sensitive?.rawSettings.find((r) => `settings:${r.file}` === item.id) : undefined;
  const hasSecrets = home.settings.find((s) => `settings:${s.file}` === item.id)?.hasSecrets;
  return (
    <>
      <TurnCard turn={turn} isRoot selected={isSelected(turn.id)} onToggleSelect={() => toggle(turn)} />
      {raw && hasSecrets && (
        <SensitiveText
          key={item.id}
          level="secret"
          title={`${raw.file} · unredacted`}
          text={JSON.stringify(raw.settings, null, 2)}
        />
      )}
      {item.kind === "settings" && !hasSecrets && (
        <p className="muted small">No env values or credential-looking keys in this file, so nothing was redacted.</p>
      )}
    </>
  );
}

// ---------- entry ----------

export function ClaudeHomeView() {
  const home = useAppStore((s) => s.claudeHome);
  const manifest = useAppStore((s) => s.manifest);
  const source = useAppStore((s) => s.source);
  const selected = useAppStore((s) => s.selectedClaudeItem);
  // Open transcript, remembered per project so switching projects closes it.
  const [openSession, setOpenSession] = useState<{ slug: string; id: string } | null>(null);

  const project = source === "claudeProjects" ? home?.projects.find((p) => p.slug === selected) : undefined;
  const session =
    project && openSession?.slug === project.slug ? project.sessions.find((s) => s.id === openSession.id) : undefined;
  // TranscriptThread refetches whenever `summary` changes identity.
  const summary = useMemo(() => (project && session ? sessionSummary(project, session) : null), [project, session]);

  if (!manifest?.claudeHome) {
    return (
      <div className="thread empty-state">
        <p>
          No ~/.claude export found. Run <code>python3 export_claude_home.py</code> from the repo root, then reload.
        </p>
      </div>
    );
  }
  if (!home) {
    return (
      <div className="thread empty-state">
        <p>Loading ~/.claude…</p>
      </div>
    );
  }

  if (project && summary?.file) {
    return (
      <TranscriptThread
        summary={summary}
        actions={
          <>
            <SensitiveLabel level="personal" />
            <button className="copy-btn turn-time" onClick={() => setOpenSession(null)}>
              ← back to {project.name}
            </button>
          </>
        }
      />
    );
  }

  return (
    <div className="thread">
      {source === "claudePreferences" ? (
        <PreferencesView home={home} />
      ) : source === "claudeStructure" ? (
        <StructureView home={home} />
      ) : source === "claudeProjects" ? (
        project ? (
          <ProjectDetail project={project} onOpenSession={(id) => setOpenSession({ slug: project.slug, id })} />
        ) : (
          <ProjectsOverview home={home} />
        )
      ) : (
        <ConfigView home={home} />
      )}
    </div>
  );
}
