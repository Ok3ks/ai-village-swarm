import { create } from "zustand";
import { buildAgentProfileTurn } from "./agentProfile";
import { fetchAgentComms, fetchAgents, fetchChatRooms, fetchManifest } from "./api";
import { providerInfo, type ProviderId } from "./providers";
import type {
  AgentRecord,
  ChatRoomRecord,
  CommEdge,
  Manifest,
  SourceKind,
  TranscriptSummary,
  Turn,
} from "./types";

const SETTINGS_STORAGE_KEY = "llmSettings";

interface LlmSettings {
  provider: ProviderId;
  model: string;
  apiKey: string;
}

function loadLlmSettings(): LlmSettings {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  return { provider: "local", model: providerInfo("local").defaultModel, apiKey: "" };
}

function saveLlmSettings(settings: LlmSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

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
  selectedAgentFeed: string | null;
  selectedNetworkNode: string | null;
  // Agents tab: list agents (click -> all their events) or a flat
  // chronological stream of individual events (click -> that one event).
  eventsViewMode: "agent" | "chronological";
  sidebarOpen: boolean;
  changeSource: (s: SourceKind) => void;
  selectTranscript: (r: TranscriptSummary | null) => void;
  selectRoom: (r: ChatRoomRecord | null) => void;
  selectAgentFeed: (agentName: string | null) => void;
  selectNetworkNode: (id: string | null) => void;
  setEventsViewMode: (m: "agent" | "chronological") => void;
  setSidebarOpen: (v: boolean) => void;
  toggleSidebarOpen: () => void;

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
  openAgentChat: (id: string) => void;

  // ---- LLM provider settings (configuration only for now; not yet wired
  // into sendChatMessages/summarizeTurns/classifyTurns) ----
  settingsOpen: boolean;
  llmProvider: ProviderId;
  llmModel: string;
  llmApiKey: string;
  toggleSettingsOpen: () => void;
  setLlmProvider: (p: ProviderId) => void;
  setLlmModel: (m: string) => void;
  setLlmApiKey: (k: string) => void;
}

const initialLlmSettings = loadLlmSettings();

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
  selectedAgentFeed: null,
  selectedNetworkNode: null,
  eventsViewMode: "agent",
  sidebarOpen: false,

  changeSource: (s) =>
    set({
      source: s,
      selected: null,
      selectedRoom: null,
      selectedAgentFeed: null,
      selectedNetworkNode: null,
      sidebarOpen: false,
    }),

  selectTranscript: (r) => set({ selected: r, sidebarOpen: false }),
  selectRoom: (r) => set({ selectedRoom: r, sidebarOpen: false }),
  selectAgentFeed: (agentName) => set({ selectedAgentFeed: agentName, sidebarOpen: false }),
  selectNetworkNode: (id) => set({ selectedNetworkNode: id }),
  setEventsViewMode: (m) => set({ eventsViewMode: m }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebarOpen: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

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

  openAgentChat: (id) => {
    const { agents, rooms, agentComms } = get();
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    const nameById = new Map(agents.map((a) => [a.id, a.name ?? a.id]));
    const turn = buildAgentProfileTurn(agent, agents, rooms, agentComms, nameById);
    get().addToChatSelection(turn);
  },

  settingsOpen: false,
  llmProvider: initialLlmSettings.provider,
  llmModel: initialLlmSettings.model,
  llmApiKey: initialLlmSettings.apiKey,

  toggleSettingsOpen: () => set((s) => ({ settingsOpen: !s.settingsOpen })),

  setLlmProvider: (p) => {
    const model = providerInfo(p).defaultModel;
    set({ llmProvider: p, llmModel: model });
    saveLlmSettings({ provider: p, model, apiKey: get().llmApiKey });
  },

  setLlmModel: (m) => {
    set({ llmModel: m });
    saveLlmSettings({ provider: get().llmProvider, model: m, apiKey: get().llmApiKey });
  },

  setLlmApiKey: (k) => {
    set({ llmApiKey: k });
    saveLlmSettings({ provider: get().llmProvider, model: get().llmModel, apiKey: k });
  },
}));
