import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { ChatPanel, type ChatContext } from "./components/ChatPanel";
import { EventBatchBar } from "./components/EventBatchBar";
import { NetworkGraph } from "./components/NetworkGraph";
import { RoomDetail } from "./components/RoomDetail";
import { Sidebar } from "./components/Sidebar";
import { Timeline } from "./components/Timeline";
import { TranscriptThread } from "./components/TranscriptThread";
import { buildAgentProfileTurn } from "./lib/agentProfile";
import { fetchAgentComms, fetchAgents, fetchChatRooms, fetchManifest } from "./lib/api";
import type { AgentRecord, ChatRoomRecord, CommEdge, Manifest, SourceKind, TranscriptSummary } from "./lib/types";
import { useTranscriptIndex } from "./lib/useTranscriptIndex";

const DISCARD_CHAT_MESSAGE = "You have an ongoing chat conversation that hasn't been saved. Discard it?";

function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceKind>("claudeCode");
  const [selected, setSelected] = useState<TranscriptSummary | null>(null);
  const [showTimeline, setShowTimeline] = useState(true);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [rooms, setRooms] = useState<ChatRoomRecord[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoomRecord | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [chatDirty, setChatDirty] = useState(false);
  const [agentComms, setAgentComms] = useState<CommEdge[]>([]);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchManifest()
      .then(setManifest)
      .catch((e) => setManifestError(String(e)));
    fetchAgents()
      .then(setAgents)
      .catch((e) => setFetchErrors((prev) => [...prev, `Failed to load agents: ${e}`]));
    fetchChatRooms()
      .then(setRooms)
      .catch((e) => setFetchErrors((prev) => [...prev, `Failed to load chat rooms: ${e}`]));
    fetchAgentComms()
      .then(setAgentComms)
      .catch((e) => setFetchErrors((prev) => [...prev, `Failed to load agent communication graph: ${e}`]));
  }, []);

  const agentNameById = useMemo(() => new Map(agents.map((a) => [a.id, a.name ?? a.id])), [agents]);

  const chunkedSource =
    source === "trees" || source === "orphans" || source === "events" ? manifest?.[source] : undefined;
  const chunkedIndex = useTranscriptIndex(chunkedSource);

  const claudeCodeRows = useMemo(() => manifest?.claudeCode.transcripts ?? [], [manifest]);

  const index =
    source === "claudeCode"
      ? {
          rows: claudeCodeRows,
          loadedChunks: 1,
          totalChunks: 1,
          loading: !manifest,
          hasMore: false,
          loadMore: () => {},
        }
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

  // Guards every path that would otherwise silently blow away an active
  // chat conversation (switching tabs, opening a different agent chat,
  // closing the panel) once the user has sent at least one follow-up.
  const confirmDiscardChat = () => !chatContext || !chatDirty || window.confirm(DISCARD_CHAT_MESSAGE);

  const changeSource = (s: SourceKind) => {
    if (!confirmDiscardChat()) return;
    setSource(s);
    setSelected(null);
    setSelectedRoom(null);
    setSelectedEventIds(new Set());
    setChatDirty(false);
    setChatContext(null);
  };

  const openChat = (turns: ChatContext["turns"], label: string) => {
    if (!confirmDiscardChat()) return;
    setChatDirty(false);
    setChatContext({ turns, label });
  };

  const closeChat = () => {
    if (!confirmDiscardChat()) return;
    setChatDirty(false);
    setChatContext(null);
  };

  const openAgentChat = (id: string) => {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    const turn = buildAgentProfileTurn(agent, agents, rooms, agentComms, agentNameById);
    openChat([turn], `Chat about ${agent.name ?? agent.id}`);
  };

  return (
    <div
      className={`app-layout ${chatContext ? "" : "app-layout-no-panel"} ${sidebarOpen ? "sidebar-open" : ""}`}
    >
      {fetchErrors.length > 0 && (
        <div className="fetch-error-banner" role="alert">
          <ul>
            {fetchErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <button className="copy-btn" onClick={() => setFetchErrors([])}>
            dismiss
          </button>
        </div>
      )}
      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      <Sidebar
        source={source}
        onSourceChange={(s) => {
          changeSource(s);
          setSidebarOpen(false);
        }}
        rows={index.rows}
        loadedChunks={index.loadedChunks}
        totalChunks={index.totalChunks}
        loading={index.loading}
        hasMore={index.hasMore}
        onLoadMore={index.loadMore}
        treesCount={manifest?.trees.count ?? 0}
        orphansCount={manifest?.orphans.count ?? 0}
        claudeCodeCount={manifest?.claudeCode.count ?? 0}
        eventsCount={manifest?.events?.count ?? 0}
        selectedId={selected?.id ?? null}
        onSelect={(r) => {
          setSelected(r);
          setSidebarOpen(false);
        }}
        rooms={rooms}
        selectedRoomId={selectedRoom?.id ?? null}
        onSelectRoom={(r) => {
          setSelectedRoom(r);
          setSidebarOpen(false);
        }}
        selectedEventIds={selectedEventIds}
        onToggleEvent={toggleEvent}
        chatOpen={chatContext !== null}
        onToggleChat={() => {
          if (chatContext) {
            closeChat();
          } else {
            openChat([], "Chat");
          }
          setSidebarOpen(false);
        }}
      />
      <main className="main-pane">
        <button className="sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sidebar">
          ☰
        </button>
        {source === "rooms" ? (
          <RoomDetail
            room={selectedRoom}
            chunkFiles={selectedRoom ? manifest?.roomMessages?.[selectedRoom.id]?.chunkFiles : undefined}
            onSummarize={openChat}
          />
        ) : source === "network" ? (
          <div className="thread">
            <NetworkGraph edges={agentComms} nameById={agentNameById} onChatAgent={openAgentChat} />
          </div>
        ) : (
          <>
            <div className="timeline-panel">
              <button className="timeline-toggle" onClick={() => setShowTimeline((v) => !v)}>
                {showTimeline ? "▾" : "▸"} Timeline ({index.rows.length.toLocaleString()} items)
              </button>
              {showTimeline && (
                <Timeline rows={index.rows} selectedId={selected?.id ?? null} onSelect={setSelected} />
              )}
            </div>
            {source === "events" && (
              <EventBatchBar
                selectedRows={selectedEventRows}
                onClear={() => setSelectedEventIds(new Set())}
                onSummarize={openChat}
              />
            )}
            <TranscriptThread summary={selected} onSummarize={openChat} />
          </>
        )}
      </main>
      {chatContext && <ChatPanel context={chatContext} onClose={closeChat} onDirtyChange={setChatDirty} />}
    </div>
  );
}

export default App;
