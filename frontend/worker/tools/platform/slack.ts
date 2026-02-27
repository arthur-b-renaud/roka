/**
 * Slack platform tools using @slack/web-api directly.
 * Replaces LangChain Slack toolkit.
 */

import { tool } from "ai";
import { z } from "zod";
import { WebClient } from "@slack/web-api";

export function buildSlackTools(accessToken: string) {
  const client = new WebClient(accessToken);

  const sendSlackMessage = tool({
    description:
      "Send a message to a Slack channel. Requires the channel ID (not name).",
    inputSchema: z.object({
      channel: z.string().describe("Slack channel ID (e.g. C01234567)"),
      text: z.string().describe("Message text (supports Slack markdown)"),
    }),
    execute: async ({ channel, text }) => {
      try {
        const res = await client.chat.postMessage({ channel, text });
        if (res.ok) {
          return `Message sent to channel ${channel}. Timestamp: ${res.ts}`;
        }
        return `Failed to send message: ${res.error}`;
      } catch (e) {
        return `Slack error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });

  const listSlackChannels = tool({
    description:
      "List Slack channels the bot has access to. Returns channel name and ID.",
    inputSchema: z.object({
      limit: z.number().default(20).describe("Max channels to return"),
    }),
    execute: async ({ limit }) => {
      try {
        const res = await client.conversations.list({
          limit,
          types: "public_channel,private_channel",
        });
        const channels = res.channels || [];
        if (channels.length === 0) return "No channels found.";
        const results = channels.map(
          (ch) => `- #${ch.name} (id=${ch.id}, members=${ch.num_members || "?"})`,
        );
        return `Found ${results.length} channels:\n${results.join("\n")}`;
      } catch (e) {
        return `Slack error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });

  return {
    send_slack_message: sendSlackMessage,
    list_slack_channels: listSlackChannels,
  };
}
