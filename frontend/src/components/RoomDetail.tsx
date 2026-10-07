import { useEffect, useState } from "react";
import { useRoomMessages } from "../lib/useRoomMessages";
import type { ChatRoomRecord, Turn } from "../lib/types";
import { TurnCard } from "./TurnCard";

interface Props {
  room: ChatRoomRecord | null;
  chunkFiles: string[] | undefined;
  onSummarize: (turns: Turn[], label: string) => void;
}

export function RoomDetail({ room, chunkFiles, onSummarize }: Props) {
  const { turns, totalLoaded, hasMore, loadMore } = useRoomMessages(chunkFiles);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [room?.id]);

  if (!room) {
    return (
      <div className="thread empty-state">
        <p>Select a room from the left to view it.</p>
      </div>
    );
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSummarize = () => {
    const selected = turns.filter((t) => selectedIds.has(t.id));
    onSummarize(selected, `Summarize ${selected.length} selected message(s) from #${room.name ?? room.id}`);
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
          <div className="summarize-bar">
            <span className="muted small">
              {selectedIds.size} message(s) selected · {totalLoaded.toLocaleString()} loaded
            </span>
            <button
              className="summarize-btn"
              disabled={selectedIds.size <= 1}
              title={selectedIds.size <= 1 ? "Select more than one message to summarize" : undefined}
              onClick={handleSummarize}
            >
              Summarize selected
            </button>
            {selectedIds.size > 0 && (
              <button className="expand-btn" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </button>
            )}
          </div>

          {turns.map((t) => (
            <TurnCard key={t.id} turn={t} isRoot={false} selected={selectedIds.has(t.id)} onToggleSelect={toggleSelect} />
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
