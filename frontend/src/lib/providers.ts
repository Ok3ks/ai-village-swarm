export type ProviderId = "local" | "openrouter";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  defaultModel: string;
  requiresApiKey: boolean;
}

// Wiring these providers into actual chat requests (sendChatMessages etc.)
// is future work -- this is the configuration UI only for now.
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "local",
    label: "Local (vLLM / sglang)",
    defaultModel: "mlx-community/Qwen3.8-27B-4bit",
    requiresApiKey: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "anthropic/claude-sonnet-5",
    requiresApiKey: true,
  },
];

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}
