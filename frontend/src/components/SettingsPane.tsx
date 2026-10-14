import { PROVIDERS, providerInfo } from "../lib/providers";
import { useAppStore } from "../lib/store";

export function SettingsPane() {
  const provider = useAppStore((s) => s.llmProvider);
  const model = useAppStore((s) => s.llmModel);
  const apiKey = useAppStore((s) => s.llmApiKey);
  const setLlmProvider = useAppStore((s) => s.setLlmProvider);
  const setLlmModel = useAppStore((s) => s.setLlmModel);
  const setLlmApiKey = useAppStore((s) => s.setLlmApiKey);
  const toggleSettingsOpen = useAppStore((s) => s.toggleSettingsOpen);

  const info = providerInfo(provider);

  return (
    <div className="thread settings-pane">
      <div className="chat-header">
        <h2>LLM Provider</h2>
        <button className="icon-btn" onClick={toggleSettingsOpen} aria-label="Close settings" title="Close settings">
          ✕
        </button>
      </div>

      <p className="muted small">
        Not yet wired up to chat requests — this configures what will be used once provider
        switching is implemented.
      </p>

      <div className="settings-field">
        <label htmlFor="settings-provider">Provider</label>
        <select
          id="settings-provider"
          value={provider}
          onChange={(e) => setLlmProvider(e.target.value as typeof provider)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-field">
        <label htmlFor="settings-model">Model</label>
        <input
          id="settings-model"
          type="text"
          value={model}
          placeholder={info.defaultModel}
          onChange={(e) => setLlmModel(e.target.value)}
        />
      </div>

      {info.requiresApiKey && (
        <div className="settings-field">
          <label htmlFor="settings-api-key">API key</label>
          <input
            id="settings-api-key"
            type="password"
            value={apiKey}
            placeholder="sk-or-..."
            onChange={(e) => setLlmApiKey(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
