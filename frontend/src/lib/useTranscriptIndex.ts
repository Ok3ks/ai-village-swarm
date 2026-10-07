import { useEffect, useRef, useState } from "react";
import { fetchIndexChunk } from "./api";
import type { SourceManifest, TranscriptSummary } from "./types";

// Sources like events (381k rows / 191 chunks) or orphans (102k rows / 205
// chunks) would otherwise auto-load every chunk into state on mount, making
// every Sidebar filter useMemo recompute over an ever-growing array with no
// way to stop it. Cap auto-loading and let the user ask for more.
const CHUNKS_PER_PAGE = 10;

interface IndexState {
  rows: TranscriptSummary[];
  loadedChunks: number;
  totalChunks: number;
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

export function useTranscriptIndex(source: SourceManifest | undefined): IndexState {
  const [rows, setRows] = useState<TranscriptSummary[]>([]);
  const [loadedChunks, setLoadedChunks] = useState(0);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(CHUNKS_PER_PAGE);
  const generation = useRef(0);
  const loadedUpTo = useRef(0);

  useEffect(() => {
    generation.current++;
    loadedUpTo.current = 0;
    setRows([]);
    setLoadedChunks(0);
    setLimit(CHUNKS_PER_PAGE);
  }, [source]);

  useEffect(() => {
    if (!source) return;
    const myGeneration = generation.current;
    const target = Math.min(limit, source.indexChunks.length);
    if (loadedUpTo.current >= target) return;
    setLoading(true);

    (async () => {
      while (loadedUpTo.current < target) {
        if (generation.current !== myGeneration) return;
        const chunk = await fetchIndexChunk(source.indexChunks[loadedUpTo.current]);
        if (generation.current !== myGeneration) return;
        setRows((prev) => prev.concat(chunk));
        loadedUpTo.current += 1;
        setLoadedChunks(loadedUpTo.current);
      }
      if (generation.current === myGeneration) setLoading(false);
    })();
  }, [source, limit]);

  const totalChunks = source?.indexChunks.length ?? 0;

  return {
    rows,
    loadedChunks,
    totalChunks,
    loading,
    hasMore: loadedChunks < totalChunks,
    loadMore: () => setLimit((n) => n + CHUNKS_PER_PAGE),
  };
}
