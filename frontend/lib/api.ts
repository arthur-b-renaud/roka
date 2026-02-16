/**
 * Client-side API layer -- typed fetch wrappers for all API routes.
 */

async function handleResponse(res: Response) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const jsonHeaders = { "Content-Type": "application/json" };

export const api = {
  nodes: {
    list: (params: Record<string, string>) =>
      fetch("/api/nodes?" + new URLSearchParams(params)).then(handleResponse),
    get: (id: string) =>
      fetch(`/api/nodes/${id}`).then(handleResponse),
    breadcrumbs: (id: string) =>
      fetch(`/api/nodes/${id}/breadcrumbs`).then(handleResponse),
    create: (data: Record<string, unknown>) =>
      fetch("/api/nodes", { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
    update: (id: string, data: Record<string, unknown>) =>
      fetch(`/api/nodes/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
    delete: (id: string) =>
      fetch(`/api/nodes/${id}`, { method: "DELETE" }).then(handleResponse),
  },

  databaseDefinitions: {
    get: (nodeId: string) =>
      fetch(`/api/database-definitions/${nodeId}`).then(handleResponse),
    create: (nodeId: string, schemaConfig: unknown[] = []) =>
      fetch(`/api/database-definitions/${nodeId}`, {
        method: "POST", headers: jsonHeaders,
        body: JSON.stringify({ nodeId, schemaConfig }),
      }).then(handleResponse),
    update: (nodeId: string, schemaConfig: unknown[]) =>
      fetch(`/api/database-definitions/${nodeId}`, {
        method: "PATCH", headers: jsonHeaders,
        body: JSON.stringify({ schemaConfig }),
      }).then(handleResponse),
  },

  databaseViews: {
    list: (databaseId: string) =>
      fetch(`/api/database-views?databaseId=${databaseId}`).then(handleResponse),
    create: (data: { databaseId: string; name: string; viewConfig: unknown; sortOrder?: number }) =>
      fetch("/api/database-views", { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
    update: (id: string, data: Record<string, unknown>) =>
      fetch(`/api/database-views/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
    delete: (id: string) =>
      fetch(`/api/database-views/${id}`, { method: "DELETE" }).then(handleResponse),
  },

  agentTasks: {
    list: (limit = 10) =>
      fetch(`/api/agent-tasks?limit=${limit}`).then(handleResponse),
    create: (data: {
      workflow: string;
      nodeId?: string | null;
      input?: Record<string, unknown>;
      conversationId?: string | null;
      agentDefinitionId?: string | null;
    }) =>
      fetch("/api/agent-tasks", { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
  },

  appSettings: {
    get: () =>
      fetch("/api/app-settings").then(handleResponse),
    update: (settings: { key: string; value: string; is_secret?: boolean }[]) =>
      fetch("/api/app-settings", { method: "PUT", headers: jsonHeaders, body: JSON.stringify(settings) }).then(handleResponse),
  },

  search: (query: string, limit = 20) =>
    fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`).then(handleResponse),

  // ── Credentials ──────────────────────────────────────

  credentials: {
    list: () =>
      fetch("/api/credentials").then(handleResponse),
    create: (data: { name: string; service: string; type: string; config: Record<string, string> }) =>
      fetch("/api/credentials", { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
    delete: (id: string) =>
      fetch("/api/credentials", { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ id }) }).then(handleResponse),
  },

  // ── Tool Definitions ─────────────────────────────────

  toolDefinitions: {
    list: () =>
      fetch("/api/tool-definitions").then(handleResponse),
    create: (data: Record<string, unknown>) =>
      fetch("/api/tool-definitions", { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
    toggle: (id: string, isActive: boolean) =>
      fetch("/api/tool-definitions", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ id, isActive }) }).then(handleResponse),
  },

  // ── Conversations ────────────────────────────────────

  conversations: {
    list: (limit = 20) =>
      fetch(`/api/conversations?limit=${limit}`).then(handleResponse),
    create: (data: { title?: string; agentDefinitionId?: string | null }) =>
      fetch("/api/conversations", { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
    messages: (conversationId: string) =>
      fetch(`/api/conversations/${conversationId}/messages`).then(handleResponse),
    sendMessage: (conversationId: string, data: { content: string; agentDefinitionId?: string | null }) =>
      fetch(`/api/conversations/${conversationId}/messages`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
  },

  // ── Agent Definitions ────────────────────────────────

  agentDefinitions: {
    list: () =>
      fetch("/api/agent-definitions").then(handleResponse),
    create: (data: Record<string, unknown>) =>
      fetch("/api/agent-definitions", { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
    update: (data: Record<string, unknown>) =>
      fetch("/api/agent-definitions", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
    delete: (id: string) =>
      fetch("/api/agent-definitions", { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ id }) }).then(handleResponse),
  },
};
