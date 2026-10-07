export type TurnKind =
  | "payload"
  | "response"
  | "recovered_text"
  | "user"
  | "assistant"
  | "system"
  | "result";

export interface Turn {
  id: string;
  kind: TurnKind;
  cite?: string | null;
  parentId?: string | null;
  tags?: string[];
  subtype?: string | null;
  createdAt?: string | null;
  text: string;
}

export interface Tree {
  root: Turn;
  turns: Turn[];
}

export interface TranscriptSummary {
  id: string;
  cite?: string | null;
  tags?: string[];
  preview: string;
  turnCount: number;
  kindCounts: Partial<Record<TurnKind, number>>;
  hasChildren?: boolean;
  // swarmtraces (chunked) sources
  chunkFile?: string;
  chunkIndex?: number;
  // claude-code (one file per transcript) source
  file?: string;
  agentId?: string;
  sdkSessionId?: string;
  startTime?: string;
  endTime?: string;
}

export interface SourceManifest {
  count: number;
  indexChunks: string[];
}

export interface ClaudeCodeManifest {
  count: number;
  transcripts: TranscriptSummary[];
}

export interface Manifest {
  source: string;
  chunkSize: number;
  trees: SourceManifest;
  orphans: SourceManifest;
  claudeCode: ClaudeCodeManifest;
}

export type SourceKind = "trees" | "orphans" | "claudeCode";
