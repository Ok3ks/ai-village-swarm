import { useEffect, useRef, useState } from "react";
import { fetchIndexChunk } from "./api";
import type { SourceManifest, TranscriptSummary } from "./types";

interface IndexState {
  rows: TranscriptSummary[];
  loadedChunks: number;
  totalChunks: number;
  loading: boolean;
}

export function useTranscriptIndex(source: SourceManifest | undefined): IndexState {
  const [rows, setRows] = useState<TranscriptSummary[]>([]);
  const [loadedChunks, setLoadedChunks] = useState(0);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    if (!source) return;
    const myGeneration = ++generation.current;
    setRows([]);
    setLoadedChunks(0);
    setLoading(true);

    (async () => {
      for (const path of source.indexChunks) {
        if (generation.current !== myGeneration) return;
        const chunk = await fetchIndexChunk(path);
        if (generation.current !== myGeneration) return;
        setRows((prev) => prev.concat(chunk));
        setLoadedChunks((n) => n + 1);
      }
      if (generation.current === myGeneration) setLoading(false);
    })();
  }, [source]);

  return { rows, loadedChunks, totalChunks: source?.indexChunks.length ?? 0, loading };
}
