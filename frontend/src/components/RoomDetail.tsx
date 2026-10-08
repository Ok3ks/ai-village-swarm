import { useAppStore } from "../lib/store";
import { useRoomMessages } from "../lib/useRoomMessages";
import type { ChatRoomRecord } from "../lib/types";
import { TurnCard } from "./TurnCard";

interface Props {
  room: ChatRoomRecord | null;
  chunkFiles: string[] | undefined;
}

export function RoomDetail({ room, chunkFiles }: Props) {
  const { turns, totalLoaded, hasMore, loadMore } = useRoomMessages(chunkFiles);
  const chatSelection = useAppStore((s) => s.chatSelection);
  const toggleChatSelection = useAppStore((s) => s.toggleChatSelection);

  if (!room) {
    return (
      <div className="thread empty-state">
        <p>Select a room from the left to view it.</p>
      </div>
    );
  }

  const isSelected = (id: string) => chatSelection.some((t) => t.id === id);
  const toggleSelect = (id: string) => {
    const turn = turns.find((t) => t.id === id);
    if (turn) toggleChatSelection(turn);
  };

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

      {!chunkFiles || chunkFiles.length === 0 ? (
        <p className="muted small">No chat messages recorded for this room.</p>
      ) : (
        <>
          <p className="muted small">{totalLoaded.toLocaleString()} message(s) loaded</p>

          {turns.map((t) => (
            <TurnCard key={t.id} turn={t} isRoot={false} selected={isSelected(t.id)} onToggleSelect={toggleSelect} />
          ))}

          {hasMore && (
            <button className="expand-btn" onClick={loadMore}>
              Load more messages
            </button>
          )}
        </>
      )}
    </div>
  );
}
