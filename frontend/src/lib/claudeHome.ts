import type { ClaudeHome, ClaudeMemory, ClaudeProject, ClaudePrompt, ClaudeSession, ClaudeTreeNode, TranscriptSummary, Turn } from "./types";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function findNode(root: ClaudeTreeNode, path: string | null): ClaudeTreeNode | null {
  if (!path) return root;
  let node: ClaudeTreeNode | undefined = root;
  for (const part of path.split("/")) {
    node = node?.children?.find((c) => c.name === part);
    if (!node) return null;
  }
  return node;
}

/** Ancestor paths of `path`, root ("") first, for breadcrumbs. */
export function pathAncestors(path: string): string[] {
  const parts = path ? path.split("/") : [];
  return ["", ...parts.map((_, i) => parts.slice(0, i + 1).join("/"))];
}

export interface Rect {
  node: ClaudeTreeNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap (Bruls et al.): lays nodes out in rows along the
 * shorter side, closing a row when adding the next node would worsen its
 * worst aspect ratio. Zero-byte nodes are dropped -- they'd have no area.
 */
export function squarify(nodes: ClaudeTreeNode[], x: number, y: number, w: number, h: number): Rect[] {
  const items = nodes.filter((n) => n.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  const total = items.reduce((s, n) => s + n.bytes, 0);
  if (total === 0) return [];
  const scale = (w * h) / total;
  const out: Rect[] = [];

  let row: ClaudeTreeNode[] = [];
  let i = 0;
  const worst = (r: ClaudeTreeNode[], side: number) => {
    const areas = r.map((n) => n.bytes * scale);
    const sum = areas.reduce((s, a) => s + a, 0);
    const max = Math.max(...areas);
    const min = Math.min(...areas);
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const layoutRow = (r: ClaudeTreeNode[]) => {
    const sum = r.reduce((s, n) => s + n.bytes * scale, 0);
    if (w >= h) {
      const rw = sum / h;
      let cy = y;
      for (const n of r) {
        const nh = (n.bytes * scale) / rw;
        out.push({ node: n, x, y: cy, w: rw, h: nh });
        cy += nh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = sum / w;
      let cx = x;
      for (const n of r) {
        const nw = (n.bytes * scale) / rh;
        out.push({ node: n, x: cx, y, w: nw, h: rh });
        cx += nw;
      }
      y += rh;
      h -= rh;
    }
  };

  while (i < items.length) {
    const side = Math.min(w, h);
    const next = [...row, items[i]];
    if (row.length === 0 || worst(next, side) <= worst(row, side)) {
      row = next;
      i++;
    } else {
      layoutRow(row);
      row = [];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}

// ---- Config tab items ----

export type ConfigKind = "settings" | "claudeMd" | "skill" | "plugin" | "plan";

export interface ConfigItem {
  id: string; // "<kind>:<key>", stored as selectedClaudeItem
  kind: ConfigKind;
  title: string;
  preview: string;
  text: string;
}

export const CONFIG_KIND_LABEL: Record<ConfigKind, string> = {
  settings: "settings",
  claudeMd: "instructions",
  skill: "skill",
  plugin: "plugin",
  plan: "plan",
};

export function configItems(home: ClaudeHome): ConfigItem[] {
  const items: ConfigItem[] = [];
  for (const s of home.settings) {
    const keys = s.settings ? Object.keys(s.settings) : [];
    items.push({
      id: `settings:${s.file}`,
      kind: "settings",
      title: s.file,
      preview: s.error ?? (keys.length ? keys.join(", ") : "empty"),
      text: s.error ?? JSON.stringify(s.settings, null, 2),
    });
  }
  if (home.claudeMd) {
    items.push({
      id: "claudeMd:CLAUDE.md",
      kind: "claudeMd",
      title: "CLAUDE.md",
      preview: home.claudeMd.slice(0, 120),
      text: home.claudeMd,
    });
  }
  for (const p of home.plugins) {
    const details = [
      p.description,
      p.version ? `Version: ${p.version}` : null,
      p.skills.length ? `Skills: ${p.skills.join(", ")}` : null,
      p.hasMcp ? "Bundles MCP servers (.mcp.json)" : null,
      `Path: ${p.path}`,
    ];
    items.push({
      id: `plugin:${p.path}`,
      kind: "plugin",
      title: p.isMarketplace ? `${p.name} (marketplace)` : p.name,
      preview: p.description,
      text: details.filter(Boolean).join("\n\n"),
    });
  }
  for (const s of home.skills) {
    items.push({
      id: `skill:${s.path}`,
      kind: "skill",
      title: s.name,
      preview: s.description,
      text: `${s.description}\n\nPath: ${s.path}`,
    });
  }
  for (const p of home.plans) {
    items.push({ id: `plan:${p.name}`, kind: "plan", title: p.title, preview: p.name, text: p.text });
  }
  return items;
}

// ---- chat-cart turns, so ~/.claude items can be discussed like any other ----

export function configTurn(item: ConfigItem): Turn {
  return {
    id: `claude-${item.id}`,
    kind: "config",
    cite: item.title,
    tags: [CONFIG_KIND_LABEL[item.kind]],
    text: item.text,
  };
}

export function memoryTurn(project: ClaudeProject, m: ClaudeMemory): Turn {
  return {
    id: `claude-memory:${project.slug}/${m.name}`,
    kind: "config",
    subtype: "memory",
    cite: m.name,
    tags: [m.type, ...m.links.map((l) => `→ ${l}`)],
    createdAt: m.mtime,
    text: `${m.description}\n\n${m.body}`,
  };
}

// ---- Preferences: memories across all projects ----

// Memory types that record how the user wants Claude to work, as opposed to
// facts about a project or pointers elsewhere.
export const PREFERENCE_TYPES = new Set(["feedback", "user"]);

export interface MemoryEntry {
  id: string; // "<project slug>/<memory name>", stored as selectedClaudeItem
  project: ClaudeProject;
  memory: ClaudeMemory;
  isPreference: boolean;
}

/** All memories, preferences first, then by project and name. */
export function allMemories(home: ClaudeHome): MemoryEntry[] {
  const out = home.projects.flatMap((project) =>
    project.memories.map((memory) => ({
      id: `${project.slug}/${memory.name}`,
      project,
      memory,
      isPreference: PREFERENCE_TYPES.has(memory.type),
    }))
  );
  return out.sort(
    (a, b) =>
      Number(b.isPreference) - Number(a.isPreference) ||
      a.project.name.localeCompare(b.project.name) ||
      a.memory.name.localeCompare(b.memory.name)
  );
}

/** [[link]] edges between memories; a link resolves within its own project first. */
export function memoryLinks(entries: MemoryEntry[]): [string, string][] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const byName = new Map(entries.map((e) => [e.memory.name, e]));
  const seen = new Set<string>();
  const edges: [string, string][] = [];
  for (const e of entries) {
    for (const link of e.memory.links) {
      const target = byId.get(`${e.project.slug}/${link}`) ?? byName.get(link);
      if (!target || target.id === e.id) continue;
      const key = [e.id, target.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([e.id, target.id]);
    }
  }
  return edges;
}

export function promptTurn(project: ClaudeProject, p: ClaudePrompt, i: number): Turn {
  const pastes = p.pastes.map((t, n) => `\n\n--- pasted content ${n + 1} ---\n${t}`).join("");
  return {
    id: `claude-prompt:${project.slug}/${i}`,
    kind: "prompt",
    cite: p.sessionId ? `session ${p.sessionId.slice(0, 8)}` : null,
    createdAt: p.createdAt,
    text: `${p.text}${pastes}`,
  };
}

/** Adapts a ~/.claude session to what TranscriptThread expects. */
export function sessionSummary(project: ClaudeProject, s: ClaudeSession): TranscriptSummary {
  return {
    id: s.id,
    file: s.file ?? undefined,
    preview: s.title ?? "",
    turnCount: s.userMessages + s.assistantMessages,
    kindCounts: {},
    agentName: `${project.name} · ${s.title ?? s.id.slice(0, 8)}`,
    startTime: s.start,
    endTime: s.end,
  };
}
