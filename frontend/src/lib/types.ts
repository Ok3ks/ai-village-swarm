export type TurnKind =
  | "payload"
  | "response"
  | "recovered_text"
  | "user"
  | "assistant"
  | "system"
  | "result"
  | "event"
  | "chat"
  | "config"
  | "prompt";

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
  agentPairMessages?: Record<string, { count: number; chunkFiles: string[] }>;
  claudeHome?: FlatFileManifest;
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

export type SourceKind =
  | "trees"
  | "orphans"
  | "claudeCode"
  | "rooms"
  | "events"
  | "network"
  | "claudePreferences"
  | "claudeStructure"
  | "claudeProjects"
  | "claudeConfig";

// ---- ~/.claude export (export_claude_home.py) ----

// "secret": credentials/auth/env captures. "personal": prompts, transcripts,
// pastes, file snapshots.
export type Sensitivity = "secret" | "personal";

export interface ClaudeTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  bytes: number;
  files: number;
  mtime?: string;
  description?: string;
  sensitivity?: Sensitivity;
  // Path (under data/) of the file's exported text, when it was small,
  // text, and the sensitive export was enabled.
  contentFile?: string;
  folded?: boolean;
  children?: ClaudeTreeNode[];
}

export interface ClaudeSession {
  id: string;
  title: string | null;
  // Flat transcript (data/<file>), present with the sensitive export.
  file: string | null;
  // Set on subagent sessions: the session that spawned them.
  parentId?: string;
  agentType?: string | null;
  bytes: number;
  messages: number;
  userMessages: number;
  assistantMessages: number;
  start: string;
  end: string;
}

export interface ClaudeMemory {
  name: string;
  description: string;
  type: string;
  mtime: string;
  links: string[];
  body: string;
}

export interface ClaudeProject {
  slug: string;
  path: string;
  name: string;
  bytes: number;
  sessions: ClaudeSession[];
  sessionCount: number;
  memories: ClaudeMemory[];
  memoryIndex: string | null;
  promptCount: number;
  promptsByDay: Record<string, number>;
  lastActive: string | null;
}

export interface ClaudeSkill {
  name: string;
  description: string;
  path: string;
}

export interface ClaudePlugin {
  name: string;
  description: string;
  version?: string | null;
  path: string;
  skills: string[];
  hasMcp: boolean;
  isMarketplace?: boolean;
}

export interface ClaudePlan {
  name: string;
  title: string;
  mtime: string;
  text: string;
}

export interface ClaudeHome {
  root: string;
  exportedAt: string;
  tree: ClaudeTreeNode;
  settings: { file: string; settings?: Record<string, unknown>; error?: string; hasSecrets?: boolean }[];
  sensitiveFile: string | null;
  claudeMd: string | null;
  skills: ClaudeSkill[];
  plugins: ClaudePlugin[];
  plans: ClaudePlan[];
  projects: ClaudeProject[];
}

export interface ClaudePrompt {
  createdAt: string;
  sessionId: string | null;
  text: string;
  pastes: string[];
}

export interface ClaudeSensitive {
  rawSettings: { file: string; settings: Record<string, unknown> }[];
  prompts: Record<string, ClaudePrompt[]>; // by project slug
}
