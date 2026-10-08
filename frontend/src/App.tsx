import { useEffect, useMemo } from "react";
import "./App.css";
import { ChatPanel } from "./components/ChatPanel";
import { NetworkGraph } from "./components/NetworkGraph";
import { RoomDetail } from "./components/RoomDetail";
import { Sidebar } from "./components/Sidebar";
import { Timeline } from "./components/Timeline";
import { TranscriptThread } from "./components/TranscriptThread";
import { useAppStore } from "./lib/store";
import { useTranscriptIndex } from "./lib/useTranscriptIndex";

function App() {
  const manifest = useAppStore((s) => s.manifest);
  const manifestError = useAppStore((s) => s.manifestError);
  const source = useAppStore((s) => s.source);
  const selected = useAppStore((s) => s.selected);
  const selectedRoom = useAppStore((s) => s.selectedRoom);
  const showTimeline = useAppStore((s) => s.showTimeline);
  const toggleShowTimeline = useAppStore((s) => s.toggleShowTimeline);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const toggleSidebarOpen = useAppStore((s) => s.toggleSidebarOpen);
  const chatOpen = useAppStore((s) => s.chatOpen);
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
    <div className={`app-layout ${chatOpen ? "" : "app-layout-no-panel"} ${sidebarOpen ? "sidebar-open" : ""}`}>
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
        <button className="sidebar-toggle" onClick={toggleSidebarOpen} aria-label="Toggle sidebar">
          ☰
        </button>
        {source === "rooms" ? (
          <RoomDetail
            room={selectedRoom}
            chunkFiles={selectedRoom ? manifest?.roomMessages?.[selectedRoom.id]?.chunkFiles : undefined}
          />
        ) : source === "network" ? (
          <div className="thread">
            <NetworkGraph />
          </div>
        ) : (
          <>
            <div className="timeline-panel">
              <button className="timeline-toggle" onClick={toggleShowTimeline}>
                {showTimeline ? "▾" : "▸"} Timeline ({index.rows.length.toLocaleString()} items)
              </button>
              {showTimeline && <Timeline rows={index.rows} />}
            </div>
            <TranscriptThread summary={selected} />
          </>
        )}
      </main>
      {chatOpen && <ChatPanel />}
    </div>
  );
}

export default App;
