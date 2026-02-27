/**
 * LLM configuration service — reads from DB with 3-tier fallback:
 * 1. credentials table (service='llm', is_active=true) — decrypted via vault
 * 2. app_settings table (llm_provider, llm_model, llm_api_key, llm_api_base)
 * 3. LITELLM_MODEL env var (default openai/gpt-4o)
 *
 * Caches in memory with 60s TTL. Returns a Vercel AI SDK provider instance.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";
import { decrypt } from "@/lib/vault";

export interface LLMConfig {
  provider: string;
  model: string;
  apiKey: string;
  apiBase: string;
  isConfigured: boolean;
}

const LLM_CACHE_TTL_MS = 60_000;
let cache: LLMConfig | null = null;
let cacheTs = 0;

export function invalidateLLMCache(): void {
  cache = null;
  cacheTs = 0;
}

export async function getLLMConfig(db: PostgresJsDatabase<typeof schema>): Promise<LLMConfig> {
  const now = Date.now();
  if (cache && now - cacheTs < LLM_CACHE_TTL_MS) return cache;

  let provider = "";
  let model = "";
  let apiKey = "";
  let apiBase = "";

  // Tier 1: credentials table (vault-encrypted)
  try {
    const rows = await db.execute(sql`
      SELECT config_encrypted AS "configEncrypted" FROM credentials
      WHERE service = 'llm' AND is_active = true
      ORDER BY updated_at DESC LIMIT 1
    `);
    const row = rows[0] as unknown as { configEncrypted: string } | undefined;
    if (row?.configEncrypted) {
      const config = decrypt(row.configEncrypted);
      provider = (config.provider as string) || "";
      model = (config.model as string) || "";
      apiKey = (config.api_key as string) || "";
      apiBase = (config.api_base as string) || "";
    }
  } catch {
    // fall through
  }

  // Tier 2: app_settings
  if (!provider || !model) {
    try {
      const rows = await db.execute(sql`
        SELECT key, value FROM app_settings
        WHERE key = ANY(ARRAY['llm_provider','llm_model','llm_api_key','llm_api_base']::text[])
      `);
      const settings: Record<string, string> = {};
      for (const r of rows as unknown as Array<{ key: string; value: string }>) {
        settings[r.key] = r.value;
      }
      if (!provider) provider = (settings.llm_provider || "").trim();
      if (!model) model = (settings.llm_model || "").trim();
      if (!apiKey) apiKey = (settings.llm_api_key || "").trim();
      if (!apiBase) apiBase = (settings.llm_api_base || "").trim();
    } catch {
      // fall through
    }
  }

  // Tier 3: env var
  if (!provider || !model) {
    const fallback = process.env.LITELLM_MODEL || "openai/gpt-4o";
    const parts = fallback.split("/", 2);
    if (!provider) provider = parts.length === 2 ? parts[0] : "openai";
    if (!model) model = parts.length === 2 ? parts[1] : fallback;
  }

  const isConfigured = Boolean(apiKey) || provider === "ollama";
  cache = { provider, model, apiKey, apiBase, isConfigured };
  cacheTs = now;
  return cache;
}

export function buildProvider(config: LLMConfig) {
  const baseURL =
    config.apiBase ||
    (config.provider === "ollama"
      ? "http://host.docker.internal:11434/v1"
      : config.provider === "openrouter"
        ? "https://openrouter.ai/api/v1"
        : undefined);

  return createOpenAI({
    apiKey: config.apiKey || "not-needed",
    baseURL,
  });
}

/**
 * Convenience: get a ready-to-use LanguageModelV1 instance.
 * Optionally override the model name (e.g. from a team member config).
 */
export async function getModel(
  db: PostgresJsDatabase<typeof schema>,
  modelOverride?: string | null,
): Promise<{ model: LanguageModel; config: LLMConfig }> {
  const config = await getLLMConfig(db);
  if (!config.isConfigured) {
    throw new Error("LLM not configured. Go to Settings to add your API key.");
  }
  const provider = buildProvider(config);
  const modelName = modelOverride || config.model;
  return { model: provider(modelName), config };
}
