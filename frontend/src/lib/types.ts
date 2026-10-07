export type TurnKind =
  | "payload"
  | "response"
  | "recovered_text"
  | "user"
  | "assistant"
  | "system"
  | "result"
  | "event"
  | "chat";

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
  // For events, keyed by action_type (a raw string, not a TurnKind literal) so
  // the sidebar's kind-chip filter can reuse the same mechanism.
  kindCounts: Partial<Record<string, number>>;
  hasChildren?: boolean;
  // swarmtraces (chunked) sources
  chunkFile?: string;
  chunkIndex?: number;
  // claude-code (one file per transcript) source
  file?: string;
  agentId?: string;
  agentName?: string;
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

export interface FlatFileManifest {
  count: number;
  file: string;
}

export interface Manifest {
  source: string;
  chunkSize: number;
  trees: SourceManifest;
  orphans: SourceManifest;
  claudeCode: ClaudeCodeManifest;
  agents?: FlatFileManifest;
  chatRooms?: FlatFileManifest;
  events?: SourceManifest;
  agentComms?: FlatFileManifest;
  roomMessages?: Record<string, { count: number; chunkFiles: string[] }>;
}

export interface CommEdge {
  a: string;
  b: string;
  count: number;
}

export interface AgentRecord {
  id: string;
  name: string | null;
  emoji: string | null;
  statusMessage: string | null;
  goal: string | null;
  modelString: string | null;
  isPending: boolean | null;
  isUpdatingMemory: boolean | null;
  isParticipating: boolean | null;
  money: string | null;
  pausedUntil: string | null;
  currentRoomId: string | null;
  villageId: string | null;
  inputTokensUsed: number | null;
  outputTokensUsed: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ChatRoomRecord {
  id: string;
  name: string | null;
  villageId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastNudgerRunAt: string | null;
  whitelistedAgentNames: string[] | null;
  blacklistedAgentNames: string[] | null;
}

export type SourceKind = "trees" | "orphans" | "claudeCode" | "rooms" | "events" | "network";
