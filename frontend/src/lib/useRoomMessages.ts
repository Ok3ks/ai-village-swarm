import { useEffect, useRef, useState } from "react";
import { fetchRoomMessageChunk } from "./api";
import type { Turn } from "./types";

const PAGE_SIZE = 150;

interface RoomMessagesState {
  turns: Turn[];
  totalLoaded: number;
  loadedChunks: number;
  totalChunks: number;
  hasMore: boolean;
  loadMore: () => void;
}

export function useRoomMessages(chunkFiles: string[] | undefined): RoomMessagesState {
  const [allTurns, setAllTurns] = useState<Turn[]>([]);
  const [loadedChunks, setLoadedChunks] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const generation = useRef(0);

  useEffect(() => {
    const myGeneration = ++generation.current;
    setAllTurns([]);
    setLoadedChunks(0);
    setVisibleCount(PAGE_SIZE);
    if (!chunkFiles || chunkFiles.length === 0) return;
    fetchRoomMessageChunk(chunkFiles[0]).then((chunk) => {
      if (generation.current !== myGeneration) return;
      setAllTurns(chunk);
      setLoadedChunks(1);
    });
  }, [chunkFiles]);

  const loadMore = () => {
    // First reveal more of what's already loaded before fetching another chunk.
    if (visibleCount < allTurns.length) {
      setVisibleCount((n) => n + PAGE_SIZE);
      return;
    }
    if (!chunkFiles || loadedChunks >= chunkFiles.length) return;
    const myGeneration = generation.current;
    fetchRoomMessageChunk(chunkFiles[loadedChunks]).then((chunk) => {
      if (generation.current !== myGeneration) return;
      setAllTurns((prev) => prev.concat(chunk));
      setLoadedChunks((n) => n + 1);
      setVisibleCount((n) => n + PAGE_SIZE);
    });
  };

  const hasMore = visibleCount < allTurns.length || (chunkFiles ? loadedChunks < chunkFiles.length : false);

  return {
    turns: allTurns.slice(0, visibleCount),
    totalLoaded: allTurns.length,
    loadedChunks,
    totalChunks: chunkFiles?.length ?? 0,
    hasMore,
    loadMore,
  };
}
