import type { ChatRoomRecord } from "../lib/types";

export function RoomDetail({ room }: { room: ChatRoomRecord | null }) {
  if (!room) {
    return (
      <div className="thread empty-state">
        <p>Select a room from the left to view it.</p>
      </div>
    );
  }

  return (
    <div className="thread">
      <div className="turn-card turn-root">
        <div className="turn-header">
          <span className="turn-role">#{room.name ?? room.id}</span>
        </div>
        <dl className="agent-fields">
          <dt>Whitelisted agents</dt>
          <dd>
            {room.whitelistedAgentNames && room.whitelistedAgentNames.length > 0 ? (
              room.whitelistedAgentNames.map((n) => (
                <span key={n} className="tag">
                  {n}
                </span>
              ))
            ) : (
              <em>none (open to all)</em>
            )}
          </dd>
          <dt>Blacklisted agents</dt>
          <dd>
            {room.blacklistedAgentNames && room.blacklistedAgentNames.length > 0 ? (
              room.blacklistedAgentNames.map((n) => (
                <span key={n} className="tag">
                  {n}
                </span>
              ))
            ) : (
              <em>none</em>
            )}
          </dd>
          <dt>Village</dt>
          <dd>{room.villageId}</dd>
          <dt>Last nudger run</dt>
          <dd>{room.lastNudgerRunAt ?? <em>never</em>}</dd>
          <dt>Created / updated</dt>
          <dd>
            {room.createdAt} → {room.updatedAt}
          </dd>
        </dl>
      </div>
    </div>
  );
}
