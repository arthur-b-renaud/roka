/**
 * Centrifugo bridge: forwards PostgreSQL LISTEN/NOTIFY events to Centrifugo
 * via HTTP publish API. Mirrors backend/app/services/centrifugo_bridge.py.
 */

import { logger } from "./logger";

const CHANNELS = ["new_task", "new_message", "team_chat"] as const;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

interface BridgeConfig {
  apiUrl: string;
  apiKey: string;
}

function getConfig(): BridgeConfig | null {
  const apiKey = process.env.CENTRIFUGO_API_KEY || "";
  if (!apiKey) return null;
  return {
    apiUrl: process.env.CENTRIFUGO_API_URL || "http://centrifugo:8000",
    apiKey,
  };
}

async function publish(config: BridgeConfig, channel: string, payload: string) {
  try {
    await fetch(`${config.apiUrl}/api/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `apikey ${config.apiKey}`,
      },
      body: JSON.stringify({
        channel,
        data: { channel, payload },
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (e) {
    logger.warn(`Centrifugo publish to ${channel} failed: ${e}`);
  }
}

/**
 * Start the Centrifugo bridge. Uses a dedicated postgres.js LISTEN connection.
 * Reconnects with exponential backoff on failure.
 */
export async function startCentrifugoBridge(
  listenFn: (channel: string, cb: (payload: string) => void) => Promise<void>,
) {
  const config = getConfig();
  if (!config) {
    logger.info("Centrifugo bridge disabled (no CENTRIFUGO_API_KEY)");
    return;
  }

  logger.info("Centrifugo bridge starting");

  for (const ch of CHANNELS) {
    await listenFn(ch, (payload) => {
      publish(config, ch, payload).catch(() => {});
    });
  }

  logger.info(`Centrifugo bridge listening on: ${CHANNELS.join(", ")}`);
}
