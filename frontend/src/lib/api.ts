import type { AgentRecord, ChatRoomRecord, Manifest, Tree, TranscriptSummary } from "./types";

const dataChunkCache = new Map<string, Promise<Tree[]>>();
const indexChunkCache = new Map<string, Promise<TranscriptSummary[]>>();

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!res.ok) throw new Error(`failed to load ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchManifest(): Promise<Manifest> {
  return fetchJson<Manifest>("manifest.json");
}

let agentsCache: Promise<AgentRecord[]> | null = null;

export function fetchAgents(): Promise<AgentRecord[]> {
  if (!agentsCache) agentsCache = fetchJson<AgentRecord[]>("agents.json");
  return agentsCache;
}

let chatRoomsCache: Promise<ChatRoomRecord[]> | null = null;

export function fetchChatRooms(): Promise<ChatRoomRecord[]> {
  if (!chatRoomsCache) chatRoomsCache = fetchJson<ChatRoomRecord[]>("chat_rooms.json");
  return chatRoomsCache;
}

export function fetchIndexChunk(path: string): Promise<TranscriptSummary[]> {
  let p = indexChunkCache.get(path);
  if (!p) {
    p = fetchJson<TranscriptSummary[]>(path);
    indexChunkCache.set(path, p);
  }
  return p;
}

export function fetchDataChunk(path: string): Promise<Tree[]> {
  let p = dataChunkCache.get(path);
  if (!p) {
    p = fetchJson<Tree[]>(path);
    dataChunkCache.set(path, p);
  }
  return p;
}

interface FlatTranscript {
  turns: Tree["turns"];
}

export function fetchFlatTranscript(file: string): Promise<FlatTranscript> {
  return fetchJson<FlatTranscript>(file);
}

export async function fetchTree(summary: TranscriptSummary): Promise<Tree> {
  if (summary.file) {
    const t = await fetchFlatTranscript(summary.file);
    const [root, ...rest] = t.turns;
    return { root, turns: rest };
  }
  if (!summary.chunkFile || summary.chunkIndex === undefined) {
    throw new Error(`transcript ${summary.id} has neither file nor chunkFile`);
  }
  const chunk = await fetchDataChunk(summary.chunkFile);
  const tree = chunk[summary.chunkIndex];
  if (!tree) throw new Error(`transcript ${summary.id} missing from ${summary.chunkFile}`);
  return tree;
}
