import type { Turn } from "./types";

export interface SummarizeResult {
  text: string;
  model: string;
  tookMs: number;
}

// Must match MODEL in llm.py / the model llm.sh serves.
const MODEL = "mlx-community/Qwen3.8-27B-4bit";

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

function buildPrompt(turns: Turn[]): string {
  const rendered = turns.map((t) => `[${t.kind}] ${t.text}`).join("\n\n");
  return `Summarize the following conversation turns concisely:\n\n${rendered}`;
}

export async function summarizeTurns(turns: Turn[]): Promise<SummarizeResult> {
  const start = performance.now();

  if (turns.length === 0) {
    return { text: "No turns selected.", model: MODEL, tookMs: performance.now() - start };
  }

  let res: Response;
  try {
    res = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: buildPrompt(turns) }],
      }),
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

  return { text, model: MODEL, tookMs: performance.now() - start };
}
