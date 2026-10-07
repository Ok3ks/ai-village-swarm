import type { Turn } from "./types";

export interface SummarizeResult {
  text: string;
  model: string;
  tookMs: number;
}

const TOOL_USE_RE = /\[tool_use: ([^\]]+)\]/g;

function extractSnippet(turns: Turn[]): string | null {
  const first = turns.find((t) => t.text.trim().length > 0);
  if (!first) return null;
  const trimmed = first.text.trim();
  const snippet = trimmed.slice(0, 240);
  return `"${snippet}${trimmed.length > 240 ? "…" : ""}"`;
}

/**
 * Stands in for a real LLM call: deterministic, offline, and based only on
 * the selected turns' text. Simulates network latency so the UI can show a
 * real loading state.
 */
export async function summarizeTurns(turns: Turn[]): Promise<SummarizeResult> {
  const start = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 350 + Math.random() * 350));

  if (turns.length === 0) {
    return { text: "No turns selected.", model: "mock-llm-v1", tookMs: performance.now() - start };
  }

  const kindCounts = new Map<string, number>();
  for (const t of turns) kindCounts.set(t.kind, (kindCounts.get(t.kind) ?? 0) + 1);
  const kindSummary = Array.from(kindCounts.entries())
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");

  const tools = new Set<string>();
  for (const t of turns) for (const m of t.text.matchAll(TOOL_USE_RE)) tools.add(m[1]);

  const lines = [`Summarized ${turns.length} selected turn(s): ${kindSummary}.`];
  if (tools.size > 0) lines.push(`Tools invoked: ${Array.from(tools).join(", ")}.`);
  const snippet = extractSnippet(turns);
  if (snippet) lines.push(`Opens with: ${snippet}`);

  return { text: lines.join("\n"), model: "mock-llm-v1", tookMs: performance.now() - start };
}
