import { create } from "zustand";
import { buildAgentProfileTurn } from "./agentProfile";
import { fetchAgentComms, fetchAgents, fetchChatRooms, fetchManifest, fetchTree } from "./api";
import type {
  AgentRecord,
  ChatRoomRecord,
  CommEdge,
  Manifest,
  SourceKind,
  TranscriptSummary,
  Turn,
} from "./types";

const DISCARD_CHAT_MESSAGE = "You have an ongoing chat conversation that hasn't been saved. Discard it?";

interface AppStore {
  // ---- fetched data ----
  manifest: Manifest | null;
  manifestError: string | null;
  agents: AgentRecord[];
  rooms: ChatRoomRecord[];
  agentComms: CommEdge[];
  fetchErrors: string[];
  init: () => void;
  dismissFetchErrors: () => void;

  // ---- navigation ----
  source: SourceKind;
  selected: TranscriptSummary | null;
  selectedRoom: ChatRoomRecord | null;
  sidebarOpen: boolean;
  showTimeline: boolean;
  changeSource: (s: SourceKind) => void;
  selectTranscript: (r: TranscriptSummary | null) => void;
  selectRoom: (r: ChatRoomRecord | null) => void;
  setSidebarOpen: (v: boolean) => void;
  toggleSidebarOpen: () => void;
  toggleShowTimeline: () => void;

  // ---- events multi-select (Events tab checkboxes; drives Classify) ----
  selectedEventIds: Set<string>;
  toggleEventSelection: (row: TranscriptSummary) => void;
  clearEventSelection: () => void;

  // ---- unified "chat cart": turns the user has selected anywhere in the
  // app (events, room chat messages, transcript turns, agent profiles) to
  // discuss with the LLM. Checking a box adds here; nothing is destroyed
  // until the user explicitly clears it or sends it to the LLM.
  chatSelection: Turn[];
  addToChatSelection: (turn: Turn) => void;
  removeFromChatSelection: (id: string) => void;
  toggleChatSelection: (turn: Turn) => void;
  clearChatSelection: () => void;

  // ---- chat panel ----
  chatOpen: boolean;
  chatDirty: boolean;
  setChatDirty: (v: boolean) => void;
  toggleChatOpen: () => void;
  closeChat: () => void;
  openAgentChat: (id: string) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  manifest: null,
  manifestError: null,
  agents: [],
  rooms: [],
  agentComms: [],
  fetchErrors: [],

  init: () => {
    fetchManifest()
      .then((manifest) => set({ manifest }))
      .catch((e) => set({ manifestError: String(e) }));
    fetchAgents()
      .then((agents) => set({ agents }))
      .catch((e) => set((s) => ({ fetchErrors: [...s.fetchErrors, `Failed to load agents: ${e}`] })));
    fetchChatRooms()
      .then((rooms) => set({ rooms }))
      .catch((e) => set((s) => ({ fetchErrors: [...s.fetchErrors, `Failed to load chat rooms: ${e}`] })));
    fetchAgentComms()
      .then((agentComms) => set({ agentComms }))
      .catch((e) =>
        set((s) => ({ fetchErrors: [...s.fetchErrors, `Failed to load agent communication graph: ${e}`] }))
      );
  },

  dismissFetchErrors: () => set({ fetchErrors: [] }),

  source: "claudeCode",
  selected: null,
  selectedRoom: null,
  sidebarOpen: false,
  showTimeline: true,

  changeSource: (s) =>
    set({
      source: s,
      selected: null,
      selectedRoom: null,
      selectedEventIds: new Set(),
      sidebarOpen: false,
    }),

  selectTranscript: (r) => set({ selected: r, sidebarOpen: false }),
  selectRoom: (r) => set({ selectedRoom: r, sidebarOpen: false }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebarOpen: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleShowTimeline: () => set((s) => ({ showTimeline: !s.showTimeline })),

  selectedEventIds: new Set(),

  toggleEventSelection: (row) => {
    const { selectedEventIds, chatSelection } = get();
    const isSelected = selectedEventIds.has(row.id);
    const nextIds = new Set(selectedEventIds);
    if (isSelected) {
      nextIds.delete(row.id);
      set({ selectedEventIds: nextIds, chatSelection: chatSelection.filter((t) => t.id !== row.id) });
      return;
    }
    nextIds.add(row.id);
    set({ selectedEventIds: nextIds });
    fetchTree(row)
      .then((tree) => {
        const state = get();
        if (state.selectedEventIds.has(row.id) && !state.chatSelection.some((t) => t.id === row.id)) {
          set({ chatSelection: [...state.chatSelection, tree.root] });
        }
      })
      .catch((e) => set((s) => ({ fetchErrors: [...s.fetchErrors, `Failed to load event ${row.id}: ${e}`] })));
  },

  clearEventSelection: () => {
    const { selectedEventIds, chatSelection } = get();
    set({
      selectedEventIds: new Set(),
      chatSelection: chatSelection.filter((t) => !selectedEventIds.has(t.id)),
    });
  },

  chatSelection: [],

  addToChatSelection: (turn) => {
    const { chatSelection } = get();
    if (chatSelection.some((t) => t.id === turn.id)) return;
    set({ chatSelection: [...chatSelection, turn] });
  },

  removeFromChatSelection: (id) => set((s) => ({ chatSelection: s.chatSelection.filter((t) => t.id !== id) })),

  toggleChatSelection: (turn) => {
    const { chatSelection } = get();
    const exists = chatSelection.some((t) => t.id === turn.id);
    set({ chatSelection: exists ? chatSelection.filter((t) => t.id !== turn.id) : [...chatSelection, turn] });
  },

  clearChatSelection: () => set({ chatSelection: [] }),

  chatOpen: false,
  chatDirty: false,
  setChatDirty: (v) => set({ chatDirty: v }),

  toggleChatOpen: () => {
    const { chatOpen } = get();
    if (chatOpen) {
      get().closeChat();
    } else {
      set({ chatOpen: true });
    }
  },

  closeChat: () => {
    const { chatDirty } = get();
    if (chatDirty && !window.confirm(DISCARD_CHAT_MESSAGE)) return;
    set({ chatOpen: false, chatDirty: false });
  },

  openAgentChat: (id) => {
    const { agents, rooms, agentComms } = get();
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    const nameById = new Map(agents.map((a) => [a.id, a.name ?? a.id]));
    const turn = buildAgentProfileTurn(agent, agents, rooms, agentComms, nameById);
    get().addToChatSelection(turn);
    set({ chatOpen: true });
  },
}));
