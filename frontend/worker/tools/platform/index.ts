/**
 * Platform tool dispatcher: routes to platform-specific builders
 * based on credential_service in tool config.
 */

import type { ToolSet } from "ai";
import { getDb } from "../../db";
import { getCredentialsByService, ensureValidToken } from "@/lib/vault";
import { logger } from "../../logger";
import { buildGmailTools } from "./google-gmail";
import { buildSlackTools } from "./slack";

export async function buildPlatformTool(
  name: string,
  config: Record<string, unknown>,
  ownerId: string,
): Promise<ToolSet | null> {
  const credentialService = (config.credential_service as string) || "";
  const toolName = (config.tool_name as string) || "";

  if (!credentialService) {
    logger.warn(`Platform tool ${name} has no credential_service in config`);
    return null;
  }

  const db = getDb();
  const creds = await getCredentialsByService(db, credentialService, ownerId);
  if (creds.length === 0) {
    logger.info(`No '${credentialService}' credential for owner ${ownerId}, skipping ${name}`);
    return null;
  }

  let token: string;
  try {
    token = await ensureValidToken(db, creds[0].id, ownerId);
  } catch (e) {
    logger.warn(`Token refresh failed for ${name}: ${e}`);
    return null;
  }
  if (!token) return null;

  let tools: ToolSet | null = null;

  switch (credentialService) {
    case "google":
      tools = buildGmailTools(token);
      break;
    case "slack":
      tools = buildSlackTools(token);
      break;
    default:
      logger.warn(`Unknown platform service: ${credentialService}`);
      return null;
  }

  if (!tools) return null;

  if (toolName && tools[toolName]) {
    return { [toolName]: tools[toolName] };
  }

  return tools;
}
