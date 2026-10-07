import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { MetadataPanel } from "./components/MetadataPanel";
import { Sidebar } from "./components/Sidebar";
import { Timeline } from "./components/Timeline";
import { TranscriptThread } from "./components/TranscriptThread";
import { fetchManifest } from "./lib/api";
import type { Manifest, SourceKind, TranscriptSummary } from "./lib/types";
import { useTranscriptIndex } from "./lib/useTranscriptIndex";

function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceKind>("claudeCode");
  const [selected, setSelected] = useState<TranscriptSummary | null>(null);
  const [showTimeline, setShowTimeline] = useState(true);

  useEffect(() => {
    fetchManifest()
      .then(setManifest)
      .catch((e) => setManifestError(String(e)));
  }, []);

  const chunkedSource = source === "trees" || source === "orphans" ? manifest?.[source] : undefined;
  const chunkedIndex = useTranscriptIndex(chunkedSource);

  const claudeCodeRows = useMemo(() => manifest?.claudeCode.transcripts ?? [], [manifest]);

  const index =
    source === "claudeCode"
      ? { rows: claudeCodeRows, loadedChunks: 1, totalChunks: 1, loading: !manifest }
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
    <div className="app-layout">
      <Sidebar
        source={source}
        onSourceChange={(s) => {
          setSource(s);
          setSelected(null);
        }}
        rows={index.rows}
        loadedChunks={index.loadedChunks}
        totalChunks={index.totalChunks}
        loading={index.loading}
        treesCount={manifest?.trees.count ?? 0}
        orphansCount={manifest?.orphans.count ?? 0}
        claudeCodeCount={manifest?.claudeCode.count ?? 0}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
      />
      <main className="main-pane">
        {source === "claudeCode" && (
          <div className="timeline-panel">
            <button className="timeline-toggle" onClick={() => setShowTimeline((v) => !v)}>
              {showTimeline ? "▾" : "▸"} Timeline ({index.rows.length} sessions, by sdk_session_id lane)
            </button>
            {showTimeline && <Timeline rows={index.rows} selectedId={selected?.id ?? null} onSelect={setSelected} />}
          </div>
        )}
        <TranscriptThread summary={selected} />
      </main>
      <MetadataPanel summary={selected} />
    </div>
  );
}

export default App;
