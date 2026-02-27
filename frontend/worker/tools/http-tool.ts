/**
 * Generic HTTP tool: calls external APIs with credential injection.
 * Port of backend/graph/tools/http_tool.py.
 */

import { tool } from "ai";
import { z } from "zod";
import { getDb } from "../db";
import { getCredentialDecrypted } from "@/lib/vault";

function interpolate(template: unknown, context: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    return template.replace(/\{\{(.+?)\}\}/g, (_, path: string) => {
      const parts = path.trim().split(".");
      let value: unknown = context;
      for (const part of parts) {
        if (value && typeof value === "object") {
          value = (value as Record<string, unknown>)[part];
        } else {
          return "";
        }
      }
      return value != null ? String(value) : "";
    });
  }
  if (Array.isArray(template)) return template.map((v) => interpolate(v, context));
  if (template && typeof template === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template)) {
      result[k] = interpolate(v, context);
    }
    return result;
  }
  return template;
}

export function buildHttpTool(
  name: string,
  config: Record<string, unknown>,
  credentialId: string | null,
) {
  const urlTemplate = (config.url as string) || "";
  const method = ((config.method as string) || "GET").toUpperCase();
  const headersTemplate = (config.headers_template as Record<string, string>) || {};
  const bodyTemplate = config.body_template || null;
  const description = (config.description as string) || `Call ${name} HTTP API`;

  return tool({
    description,
    inputSchema: z.object({
      input_text: z.string().default("").describe("Input text for the API call"),
    }),
    execute: async ({ input_text }: { input_text: string }) => {
      const context: Record<string, unknown> = { input: { text: input_text } };

      if (credentialId) {
        try {
          const db = getDb();
          const cred = await getCredentialDecrypted(db, credentialId);
          context.credential = cred.config;
        } catch (e) {
          return `Error loading credential: ${e}`;
        }
      }

      const url = interpolate(urlTemplate, context) as string;
      const headers = interpolate(headersTemplate, context) as Record<string, string>;
      const body = bodyTemplate ? interpolate(bodyTemplate, context) : null;

      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", ...headers },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(30_000),
        });

        if (res.status >= 400) {
          const text = await res.text();
          return `HTTP ${res.status}: ${text.slice(0, 500)}`;
        }

        const text = await res.text();
        return text.slice(0, 2000);
      } catch (e) {
        return `HTTP request failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}
