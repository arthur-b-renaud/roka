/**
 * POST /api/oauth/exchange — exchange authorization code for tokens.
 * Moved from Python backend/app/routes/oauth.py.
 *
 * Auth-gated. Supports Google and Slack OAuth providers.
 */

import * as h from "@/lib/api-handler";
import { z } from "zod";
import { db } from "@/lib/db";
import { createCredential } from "@/lib/vault";

const exchangeSchema = z.object({
  provider: z.enum(["google", "slack"]),
  code: z.string(),
  redirect_uri: z.string().url(),
  state: z.string().nullable().optional(),
});

interface ProviderConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  credentialName: string;
  service: string;
}

function getProviderConfig(provider: string): ProviderConfig | null {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId,
      clientSecret,
      credentialName: "Google (Gmail)",
      service: "google",
    };
  }
  if (provider === "slack") {
    const clientId = process.env.SLACK_OAUTH_CLIENT_ID;
    const clientSecret = process.env.SLACK_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      clientId,
      clientSecret,
      credentialName: "Slack Workspace",
      service: "slack",
    };
  }
  return null;
}

export const POST = h.mutation(
  async (data, userId) => {
    const config = getProviderConfig(data.provider);
    if (!config) {
      return { error: `${data.provider} not configured (missing client_id/secret)` };
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: data.code,
        redirect_uri: data.redirect_uri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Invalid OAuth exchange: ${tokenRes.status} ${text.slice(0, 200)}`);
    }

    const tokenData = await tokenRes.json();

    // Slack returns {ok: false, error: "..."} instead of HTTP errors
    if (data.provider === "slack" && !tokenData.ok) {
      throw new Error(`Invalid Slack OAuth: ${tokenData.error}`);
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new Error("Invalid OAuth response: no access_token");
    }

    const expiresAt = tokenData.expires_in
      ? Math.floor(Date.now() / 1000) + tokenData.expires_in
      : null;

    const credConfig: Record<string, unknown> = {
      access_token: accessToken,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    };

    if (data.provider === "google") {
      credConfig.scopes = ["https://mail.google.com/"];
    }

    const credential = await createCredential(db, {
      ownerId: userId,
      name: config.credentialName,
      service: config.service,
      type: "oauth2",
      config: credConfig,
    });

    return {
      status: "ok",
      credential: {
        id: credential.id,
        name: credential.name,
        service: credential.service,
        type: "oauth2",
        isActive: credential.isActive,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
      },
    };
  },
  { schema: exchangeSchema },
);
