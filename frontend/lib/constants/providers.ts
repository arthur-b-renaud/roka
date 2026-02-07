export const PROVIDERS = [
  { id: "openai", name: "OpenAI", placeholder: "sk-proj-...", needsKey: true },
  { id: "ollama", name: "Ollama (local)", placeholder: "No key needed", needsKey: false },
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-...", needsKey: true },
] as const;
