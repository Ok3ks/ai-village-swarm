import type { Turn } from "./types";

export interface SummarizeResult {
  text: string;
  model: string;
  tookMs: number;
}

// Must match MODEL in llm.py / the model llm.sh serves.
export const MODEL = "mlx-community/Qwen3.8-27B-4bit";

// Proxied by vite (see vite.config.ts) to the local vllm server, which has
// no CORS headers of its own.
const LLM_ENDPOINT = "/llm/chat/completions";

/** Thrown when the request to the LLM server never got a response (server down, network error). */
export class LlmConnectionError extends Error {
  constructor(cause: unknown) {
    super(`Could not reach the local LLM server: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "LlmConnectionError";
    this.cause = cause;
  }
}

/** Thrown when the LLM server responded with a non-2xx status. */
export class LlmHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`LLM server returned ${status}: ${body.slice(0, 500)}`);
    this.name = "LlmHttpError";
    this.status = status;
    this.body = body;
  }
}

/** Thrown when the LLM server responded 2xx but the body wasn't the expected shape. */
export class LlmResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmResponseError";
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendChatMessages(messages: ChatMessage[]): Promise<string> {
  let res: Response;
  try {
    res = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages }),
    });
  } catch (e) {
    throw new LlmConnectionError(e);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LlmHttpError(res.status, body);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (e) {
    throw new LlmResponseError(`LLM response was not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const text = (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new LlmResponseError("LLM response missing choices[0].message.content");
  }
  return text;
}

async function chatCompletion(prompt: string): Promise<string> {
  return sendChatMessages([{ role: "user", content: prompt }]);
}

export function buildSummarizePrompt(turns: Turn[]): string {
  const rendered = turns.map((t) => `[${t.kind}] ${t.text}`).join("\n\n");
  return (
    `Summarize the following conversation turns concisely. ` +
    `I may ask follow-up questions about them afterwards:\n\n${rendered}`
  );
}

export async function summarizeTurns(turns: Turn[]): Promise<SummarizeResult> {
  const start = performance.now();

  if (turns.length === 0) {
    return { text: "No turns selected.", model: MODEL, tookMs: performance.now() - start };
  }

  const text = await chatCompletion(buildSummarizePrompt(turns));
  return { text, model: MODEL, tookMs: performance.now() - start };
}

export interface ClassifyItem {
  id: string;
  label: string;
  rationale: string;
}

export interface ClassifyResult {
  model: string;
  tookMs: number;
  items: ClassifyItem[];
}

const CLASSIFY_LINE_RE = /^([^\s:]+)\s*:\s*([^\n—-]+?)\s*[—-]\s*(.*)$/;

export function parseCategories(input: string): string[] {
  return Array.from(new Set(input.split(",").map((c) => c.trim()).filter(Boolean)));
}

function buildClassifyPrompt(turns: Turn[], categories: string[]): string {
  const rendered = turns.map((t) => `### ${t.id}\n[${t.kind}] ${t.text}`).join("\n\n");
  return [
    `Classify each of the following events into exactly one of these categories: ${categories.join(", ")}.`,
    `If none fit, use "other".`,
    `Respond with exactly one line per event, no extra commentary, in this format:`,
    `<event id>: <category> — <one sentence rationale>`,
    ``,
    rendered,
  ].join("\n");
}

export async function classifyTurns(turns: Turn[], categories: string[]): Promise<ClassifyResult> {
  const start = performance.now();

  if (turns.length === 0 || categories.length === 0) {
    return { items: [], model: MODEL, tookMs: performance.now() - start };
  }

  const text = await chatCompletion(buildClassifyPrompt(turns, categories));

  const byId = new Map<string, ClassifyItem>();
  for (const line of text.split("\n")) {
    const m = line.trim().match(CLASSIFY_LINE_RE);
    if (!m) continue;
    const [, id, label, rationale] = m;
    byId.set(id, { id, label: label.trim(), rationale: rationale.trim() });
  }

  if (byId.size === 0) {
    throw new LlmResponseError(`Could not parse any classifications from the LLM response:\n\n${text}`);
  }

  const items = turns.map(
    (t) => byId.get(t.id) ?? { id: t.id, label: "(unparsed)", rationale: "LLM response didn't include this event." }
  );

  return { items, model: MODEL, tookMs: performance.now() - start };
}
