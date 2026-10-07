import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { AgentDetail } from "./components/AgentDetail";
import { EventBatchBar } from "./components/EventBatchBar";
import { MetadataPanel } from "./components/MetadataPanel";
import { RoomDetail } from "./components/RoomDetail";
import { Sidebar } from "./components/Sidebar";
import { Timeline } from "./components/Timeline";
import { TranscriptThread } from "./components/TranscriptThread";
import { fetchAgents, fetchChatRooms, fetchManifest } from "./lib/api";
import type { AgentRecord, ChatRoomRecord, Manifest, SourceKind, TranscriptSummary } from "./lib/types";
import { useTranscriptIndex } from "./lib/useTranscriptIndex";

function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceKind>("claudeCode");
  const [selected, setSelected] = useState<TranscriptSummary | null>(null);
  const [showTimeline, setShowTimeline] = useState(true);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentRecord | null>(null);
  const [rooms, setRooms] = useState<ChatRoomRecord[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoomRecord | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchManifest()
      .then(setManifest)
      .catch((e) => setManifestError(String(e)));
    fetchAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
    fetchChatRooms()
      .then(setRooms)
      .catch(() => setRooms([]));
  }, []);

  const chunkedSource =
    source === "trees" || source === "orphans" || source === "events" ? manifest?.[source] : undefined;
  const chunkedIndex = useTranscriptIndex(chunkedSource);

  const claudeCodeRows = useMemo(() => manifest?.claudeCode.transcripts ?? [], [manifest]);

  const index =
    source === "claudeCode"
      ? { rows: claudeCodeRows, loadedChunks: 1, totalChunks: 1, loading: !manifest }
      : chunkedIndex;

  const selectedEventRows = useMemo(
    () => index.rows.filter((r) => selectedEventIds.has(r.id)),
    [index.rows, selectedEventIds]
  );

  const toggleEvent = (id: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (manifestError) {
    return (
      <div className="app-error">
        <h1>Could not load transcript data</h1>
        <p>{manifestError}</p>
        <p>
          Run <code>python3 export_transcripts.py</code> and{" "}
          <code>python3 export_claude_code.py</code> from the repo root first, then{" "}
          <code>npm run dev</code> in <code>frontend/</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        source={source}
        onSourceChange={(s) => {
          setSource(s);
          setSelected(null);
          setSelectedAgent(null);
          setSelectedRoom(null);
          setSelectedEventIds(new Set());
        }}
        rows={index.rows}
        loadedChunks={index.loadedChunks}
        totalChunks={index.totalChunks}
        loading={index.loading}
        treesCount={manifest?.trees.count ?? 0}
        orphansCount={manifest?.orphans.count ?? 0}
        claudeCodeCount={manifest?.claudeCode.count ?? 0}
        eventsCount={manifest?.events?.count ?? 0}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        agents={agents}
        selectedAgentId={selectedAgent?.id ?? null}
        onSelectAgent={setSelectedAgent}
        rooms={rooms}
        selectedRoomId={selectedRoom?.id ?? null}
        onSelectRoom={setSelectedRoom}
        selectedEventIds={selectedEventIds}
        onToggleEvent={toggleEvent}
      />
      <main className="main-pane">
        {source === "agents" ? (
          <AgentDetail agent={selectedAgent} />
        ) : source === "rooms" ? (
          <RoomDetail room={selectedRoom} />
        ) : (
          <>
            {source === "claudeCode" && (
              <div className="timeline-panel">
                <button className="timeline-toggle" onClick={() => setShowTimeline((v) => !v)}>
                  {showTimeline ? "▾" : "▸"} Timeline ({index.rows.length} sessions, by sdk_session_id lane)
                </button>
                {showTimeline && (
                  <Timeline rows={index.rows} selectedId={selected?.id ?? null} onSelect={setSelected} />
                )}
              </div>
            )}
            {source === "events" && (
              <EventBatchBar selectedRows={selectedEventRows} onClear={() => setSelectedEventIds(new Set())} />
            )}
            <TranscriptThread summary={selected} />
          </>
        )}
      </main>
      {source === "agents" ? (
        <aside className="metadata-panel">
          <h2>Metadata</h2>
          <p className="muted small">
            Source: ai_village.db agents table — every registered agent in the village, including
            ones with no Claude Code transcripts (not currently participating, pending, etc).
          </p>
        </aside>
      ) : source === "rooms" ? (
        <aside className="metadata-panel">
          <h2>Metadata</h2>
          <p className="muted small">Source: ai_village.db chat_rooms table.</p>
        </aside>
      ) : (
        <MetadataPanel summary={selected} />
      )}
    </div>
  );
}

export default App;
