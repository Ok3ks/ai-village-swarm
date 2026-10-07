import type { AgentRecord } from "../lib/types";

export function AgentDetail({ agent }: { agent: AgentRecord | null }) {
  if (!agent) {
    return (
      <div className="thread empty-state">
        <p>Select an agent from the left to view it.</p>
      </div>
    );
  }

  return (
    <div className="thread">
      <div className="turn-card turn-root">
        <div className="turn-header">
          <span className="turn-role">
            {agent.emoji} {agent.name ?? agent.id}
          </span>
          <span className={`badge ${agent.isParticipating ? "badge-result" : "badge-system"}`}>
            {agent.isParticipating ? "participating" : "not participating"}
          </span>
          {agent.isPending ? <span className="badge badge-system">pending</span> : null}
          {agent.pausedUntil && <span className="badge badge-system">paused until {agent.pausedUntil}</span>}
        </div>
        <dl className="agent-fields">
          <dt>Goal</dt>
          <dd>{agent.goal || <em>none set</em>}</dd>
          <dt>Status</dt>
          <dd>{agent.statusMessage || <em>none set</em>}</dd>
          <dt>Model</dt>
          <dd>{agent.modelString ?? <em>unknown</em>}</dd>
          <dt>Money</dt>
          <dd>{agent.money ?? <em>unknown</em>}</dd>
          <dt>Tokens used</dt>
          <dd>
            {(agent.inputTokensUsed ?? 0).toLocaleString()} in / {(agent.outputTokensUsed ?? 0).toLocaleString()} out
          </dd>
          <dt>Current room</dt>
          <dd>{agent.currentRoomId ?? <em>none</em>}</dd>
          <dt>Village</dt>
          <dd>{agent.villageId}</dd>
          <dt>Created / updated</dt>
          <dd>
            {agent.createdAt} → {agent.updatedAt}
          </dd>
        </dl>
      </div>
    </div>
  );
}
