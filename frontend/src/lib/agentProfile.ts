import type { AgentRecord, ChatRoomRecord, CommEdge, Turn } from "./types";

// Builds a synthetic "turn" describing an agent's profile, so the existing
// chat panel (which only knows how to summarize/discuss Turn[]) can be
// reused to let a user ask an LLM about an agent instead of maintaining a
// separate static detail view.
export function buildAgentProfileTurn(
  agent: AgentRecord,
  agents: AgentRecord[],
  rooms: ChatRoomRecord[],
  comms: CommEdge[],
  nameById: Map<string, string>
): Turn {
  const room = rooms.find((r) => r.id === agent.currentRoomId);
  const villageMateCount = agents.filter((a) => a.villageId === agent.villageId).length;

  const correspondents = comms
    .filter((e) => e.a === agent.id || e.b === agent.id)
    .map((e) => ({ id: e.a === agent.id ? e.b : e.a, count: e.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((c) => `- ${nameById.get(c.id) ?? c.id}: ${c.count} mention(s)`)
    .join("\n");

  const participation = [
    agent.isParticipating ? "participating" : "not participating",
    agent.isPending ? "pending" : null,
    agent.pausedUntil ? `paused until ${agent.pausedUntil}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const text = [
    `Agent: ${agent.name ?? agent.id}${agent.emoji ? ` ${agent.emoji}` : ""}`,
    `Participation: ${participation}`,
    `Goal: ${agent.goal || "none set"}`,
    `Status: ${agent.statusMessage || "none set"}`,
    `Model: ${agent.modelString ?? "unknown"}`,
    `Money: ${agent.money ?? "unknown"}`,
    `Tokens used: ${(agent.inputTokensUsed ?? 0).toLocaleString()} in / ${(
      agent.outputTokensUsed ?? 0
    ).toLocaleString()} out`,
    `Current room: ${room?.name ?? agent.currentRoomId ?? "none"}`,
    `Village: ${villageMateCount} agent(s)`,
    correspondents
      ? `Top correspondents (by @-mention count in chat_messages):\n${correspondents}`
      : "No @-mention correspondents found in chat_messages.",
  ].join("\n");

  return { id: agent.id, kind: "system", text };
}
