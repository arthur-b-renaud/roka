/**
 * Gmail platform tools using googleapis directly.
 * Replaces LangChain langchain_google_community.GmailToolkit.
 */

import { tool } from "ai";
import { z } from "zod";
import { google } from "googleapis";

function buildGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

export function buildGmailTools(accessToken: string) {
  const gmail = buildGmailClient(accessToken);

  const sendGmail = tool({
    description:
      "Send an email via Gmail. Composes and sends an email to the specified recipient.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (plain text)"),
    }),
    execute: async ({ to, subject, body }) => {
      const raw = Buffer.from(
        `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
      )
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      try {
        const res = await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw },
        });
        return `Email sent successfully. Message ID: ${res.data.id}`;
      } catch (e) {
        return `Failed to send email: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });

  const searchGmail = tool({
    description:
      "Search Gmail messages. Returns subject, from, and snippet for matching emails.",
    inputSchema: z.object({
      query: z.string().describe("Gmail search query (same syntax as Gmail search bar)"),
      max_results: z.number().default(5).describe("Maximum number of results"),
    }),
    execute: async ({ query, max_results }) => {
      try {
        const listRes = await gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: max_results,
        });

        const messages = listRes.data.messages || [];
        if (messages.length === 0) return "No emails found.";

        const results: string[] = [];
        for (const msg of messages.slice(0, max_results)) {
          const detail = await gmail.users.messages.get({
            userId: "me",
            id: msg.id!,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "Date"],
          });
          const headers = detail.data.payload?.headers || [];
          const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
          const from = headers.find((h) => h.name === "From")?.value || "Unknown";
          const date = headers.find((h) => h.name === "Date")?.value || "";
          results.push(`- From: ${from} | Subject: ${subject} | Date: ${date}\n  ${detail.data.snippet || ""}`);
        }
        return `Found ${results.length} emails:\n${results.join("\n")}`;
      } catch (e) {
        return `Gmail search failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });

  return {
    send_gmail_message: sendGmail,
    search_gmail: searchGmail,
  };
}
