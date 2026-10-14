import { useEffect, useMemo } from "react";
import "./App.css";
import { AgentFeed } from "./components/AgentFeed";
import { ChatPanel } from "./components/ChatPanel";
import { NetworkGraph } from "./components/NetworkGraph";
import { OrientationHint } from "./components/OrientationHint";
import { RoomDetail } from "./components/RoomDetail";
import { SettingsPane } from "./components/SettingsPane";
import { Sidebar } from "./components/Sidebar";
import { TranscriptThread } from "./components/TranscriptThread";
import { useAppStore } from "./lib/store";
import { useTranscriptIndex } from "./lib/useTranscriptIndex";

function App() {
  const manifest = useAppStore((s) => s.manifest);
  const manifestError = useAppStore((s) => s.manifestError);
  const source = useAppStore((s) => s.source);
  const selected = useAppStore((s) => s.selected);
  const selectedRoom = useAppStore((s) => s.selectedRoom);
  const selectedAgentFeed = useAppStore((s) => s.selectedAgentFeed);
  const eventsViewMode = useAppStore((s) => s.eventsViewMode);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const toggleSidebarOpen = useAppStore((s) => s.toggleSidebarOpen);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const toggleSettingsOpen = useAppStore((s) => s.toggleSettingsOpen);
  const fetchErrors = useAppStore((s) => s.fetchErrors);
  const dismissFetchErrors = useAppStore((s) => s.dismissFetchErrors);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const selectedAgentRows = useMemo(
    () => (selectedAgentFeed ? index.rows.filter((r) => (r.agentName ?? "Unknown agent") === selectedAgentFeed) : []),
    [index.rows, selectedAgentFeed]
  );

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
    <div className={`app-layout ${sidebarOpen ? "sidebar-open" : ""}`}>
      <OrientationHint />
      {fetchErrors.length > 0 && (
        <div className="fetch-error-banner" role="alert">
          <ul>
            {fetchErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <button className="copy-btn" onClick={dismissFetchErrors}>
            dismiss
          </button>
        </div>
      )}
      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      <Sidebar
        rows={index.rows}
        loadedChunks={index.loadedChunks}
        totalChunks={index.totalChunks}
        loading={index.loading}
        hasMore={index.hasMore}
        onLoadMore={index.loadMore}
      />
      <main className="main-pane">
        <div className="main-toolbar">
          <button
            className="sidebar-toggle"
            onClick={toggleSidebarOpen}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            ☰
          </button>
          <button
            className={`settings-toggle ${settingsOpen ? "active" : ""}`}
            onClick={toggleSettingsOpen}
            title={settingsOpen ? "Close LLM provider settings" : "Open LLM provider settings"}
          >
            ⚙ Settings
          </button>
        </div>
        {settingsOpen ? (
          <SettingsPane />
        ) : source === "rooms" ? (
          <RoomDetail
            room={selectedRoom}
            chunkFiles={selectedRoom ? manifest?.roomMessages?.[selectedRoom.id]?.chunkFiles : undefined}
          />
        ) : source === "network" ? (
          <div className="thread">
            <NetworkGraph />
          </div>
        ) : source === "events" ? (
          eventsViewMode === "chronological" ? (
            <TranscriptThread summary={selected} />
          ) : selectedAgentFeed ? (
            <AgentFeed agentName={selectedAgentFeed} rows={selectedAgentRows} />
          ) : (
            <div className="thread empty-state">
              <p>Select an agent from the left to view their events.</p>
            </div>
          )
        ) : (
          <TranscriptThread summary={selected} />
        )}
      </main>
      <ChatPanel />
    </div>
  );
}

export default App;
