/**
 * Fernet-compatible credential vault.
 * Shared by both the Next.js API routes (OAuth exchange) and the worker process.
 *
 * Uses the same ROKA_VAULT_KEY (32-byte base64 Fernet key) as the Python backend
 * so existing encrypted credentials remain readable.
 */

import { Secret, Token } from "fernet";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";

const OAUTH_REFRESH_BUFFER_SEC = 300; // refresh 5 min before expiry

// ---------------------------------------------------------------------------
// Core encrypt / decrypt
// ---------------------------------------------------------------------------

function getSecret(): Secret {
  const key = process.env.ROKA_VAULT_KEY;
  if (!key) throw new Error("ROKA_VAULT_KEY not set");
  return new Secret(key);
}

export function encrypt(data: Record<string, unknown>): string {
  const secret = getSecret();
  const token = new Token({ secret });
  return token.encode(JSON.stringify(data));
}

export function decrypt(encrypted: string): Record<string, unknown> {
  const secret = getSecret();
  const token = new Token({ secret, token: encrypted, ttl: 0 });
  return JSON.parse(token.decode()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Credential CRUD
// ---------------------------------------------------------------------------

export interface CredentialRow {
  id: string;
  ownerId: string;
  name: string;
  service: string;
  type: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function createCredential(
  db: PostgresJsDatabase<typeof schema>,
  opts: {
    ownerId: string;
    name: string;
    service: string;
    type: string;
    config: Record<string, unknown>;
  },
): Promise<CredentialRow> {
  const enc = encrypt(opts.config);
  const rows = await db.execute(sql`
    INSERT INTO credentials (owner_id, name, service, type, config_encrypted)
    VALUES (${opts.ownerId}::uuid, ${opts.name}, ${opts.service}, ${opts.type}::credential_type, ${enc})
    RETURNING id, owner_id AS "ownerId", name, service, type, is_active AS "isActive",
              created_at AS "createdAt", updated_at AS "updatedAt"
  `);
  return rows[0] as unknown as CredentialRow;
}

export async function getCredentialDecrypted(
  db: PostgresJsDatabase<typeof schema>,
  credentialId: string,
): Promise<{ id: string; service: string; type: string; config: Record<string, unknown> }> {
  const rows = await db.execute(sql`
    SELECT id, service, type, config_encrypted AS "configEncrypted"
    FROM credentials WHERE id = ${credentialId}::uuid
  `);
  if (!rows[0]) throw new Error(`Credential ${credentialId} not found`);
  const row = rows[0] as unknown as { id: string; service: string; type: string; configEncrypted: string };
  return { id: row.id, service: row.service, type: row.type, config: decrypt(row.configEncrypted) };
}

export async function getCredentialsByService(
  db: PostgresJsDatabase<typeof schema>,
  service: string,
  ownerId: string,
): Promise<Array<{ id: string; service: string; type: string }>> {
  const rows = await db.execute(sql`
    SELECT id, service, type FROM credentials
    WHERE service = ${service} AND owner_id = ${ownerId}::uuid AND is_active = true
    ORDER BY updated_at DESC
  `);
  return rows as unknown as Array<{ id: string; service: string; type: string }>;
}

// ---------------------------------------------------------------------------
// OAuth token refresh
// ---------------------------------------------------------------------------

function isOAuthExpired(config: Record<string, unknown>): boolean {
  const expiresAt = config.expires_at as number | undefined;
  if (!expiresAt) return false;
  return Date.now() / 1000 > expiresAt - OAUTH_REFRESH_BUFFER_SEC;
}

async function refreshGoogleToken(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refresh_token as string,
      client_id: config.client_id as string || process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: config.client_secret as string || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
  const data = await res.json();
  return {
    ...config,
    access_token: data.access_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
  };
}

async function refreshSlackToken(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refresh_token as string,
      client_id: config.client_id as string || process.env.SLACK_OAUTH_CLIENT_ID || "",
      client_secret: config.client_secret as string || process.env.SLACK_OAUTH_CLIENT_SECRET || "",
    }),
  });
  if (!res.ok) throw new Error(`Slack token refresh failed: ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack error: ${data.error}`);
  return {
    ...config,
    access_token: data.access_token,
    refresh_token: data.refresh_token || config.refresh_token,
    expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : config.expires_at,
  };
}

/**
 * Fetches and returns a valid access_token for a credential.
 * Refreshes automatically if expired.
 */
export async function ensureValidToken(
  db: PostgresJsDatabase<typeof schema>,
  credentialId: string,
  ownerId: string,
): Promise<string> {
  const cred = await getCredentialDecrypted(db, credentialId);
  const config = cred.config;

  if (cred.type !== "oauth2") {
    return (config.api_key as string) || (config.access_token as string) || "";
  }

  if (!isOAuthExpired(config)) {
    return config.access_token as string;
  }

  let refreshed: Record<string, unknown>;
  if (cred.service === "google") {
    refreshed = await refreshGoogleToken(config);
  } else if (cred.service === "slack") {
    refreshed = await refreshSlackToken(config);
  } else {
    return config.access_token as string;
  }

  const enc = encrypt(refreshed);
  await db.execute(sql`
    UPDATE credentials SET config_encrypted = ${enc}, updated_at = now()
    WHERE id = ${credentialId}::uuid
  `);

  return refreshed.access_token as string;
}
