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
    history: (id: string, opts: { limit?: number; offset?: number; fields?: "meta" | "full" } = {}) => {
      const p = new URLSearchParams();
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      p.set("fields", opts.fields ?? "meta");
      return fetch(`/api/nodes/${id}/history?${p}`).then(handleResponse);
    },
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
    delete: (id: string) =>
      fetch("/api/tool-definitions", { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ id }) }).then(handleResponse),
  },

  // ── Executions ───────────────────────────────────────

  executions: {
    list: (limit = 50) =>
      fetch(`/api/executions?limit=${limit}`).then(handleResponse),
  },

  // ── Conversations ────────────────────────────────────

  conversations: {
    list: (limit = 20) =>
      fetch(`/api/conversations?limit=${limit}`).then(handleResponse),
    create: (data: { title?: string; agentDefinitionId?: string | null }) =>
      fetch("/api/conversations", { method: "POST", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
    messages: (conversationId: string) =>
      fetch(`/api/conversations/${conversationId}/messages`).then(handleResponse),
    sendMessage: (
      conversationId: string,
      data: {
        content: string;
        agentDefinitionId?: string | null;
        nodeId?: string | null;
        minimalMode?: boolean;
      }
    ) =>
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

  // ── Teams ───────────────────────────────────────────
  teams: {
    get: () =>
      fetch("/api/teams").then(handleResponse),
    update: (data: { name: string }) =>
      fetch("/api/teams", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(data) }).then(handleResponse),
  },

  teamMembers: {
    list: () =>
      fetch("/api/team-members").then(handleResponse),
    invite: (email: string) =>
      fetch("/api/team-members", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ email }) }).then(handleResponse),
    updateRole: (id: string, role: string) =>
      fetch(`/api/team-members/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ role }) }).then(handleResponse),
    remove: (id: string) =>
      fetch(`/api/team-members/${id}`, { method: "DELETE" }).then(handleResponse),
  },

  teamMessages: {
    list: (limit = 50, cursor?: string) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set("cursor", cursor);
      return fetch(`/api/team-messages?${params}`).then(handleResponse);
    },
    send: (content: string) =>
      fetch("/api/team-messages", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ content }) }).then(handleResponse),
  },

  chatChannels: {
    list: () =>
      fetch("/api/chat-channels").then(handleResponse),
    create: (name: string) =>
      fetch("/api/chat-channels", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ name }) }).then(handleResponse),
    createDirect: (otherUserId: string) =>
      fetch("/api/chat-channels/direct", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ otherUserId }) }).then(handleResponse),
    messages: (channelId: string, limit = 100, cursor?: string) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set("cursor", cursor);
      return fetch(`/api/chat-channels/${channelId}/messages?${params}`).then(handleResponse);
    },
    sendMessage: (channelId: string, content: string) =>
      fetch(`/api/chat-channels/${channelId}/messages`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ content }),
      }).then(handleResponse),
    members: (channelId: string) =>
      fetch(`/api/chat-channels/${channelId}/members`).then(handleResponse),
    addMember: (channelId: string, userId: string) =>
      fetch(`/api/chat-channels/${channelId}/members`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ userId }),
      }).then(handleResponse),
    removeMember: (channelId: string, userId: string) =>
      fetch(`/api/chat-channels/${channelId}/members`, {
        method: "DELETE",
        headers: jsonHeaders,
        body: JSON.stringify({ userId }),
      }).then(handleResponse),
    delete: (channelId: string) =>
      fetch(`/api/chat-channels/${channelId}`, { method: "DELETE" }).then(handleResponse),
    agents: (channelId: string) =>
      fetch(`/api/chat-channels/${channelId}/agents`).then(handleResponse),
    addAgent: (channelId: string, agentDefinitionId: string) =>
      fetch(`/api/chat-channels/${channelId}/agents`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ agentDefinitionId }),
      }).then(handleResponse),
    removeAgent: (channelId: string, agentDefinitionId: string) =>
      fetch(`/api/chat-channels/${channelId}/agents`, {
        method: "DELETE",
        headers: jsonHeaders,
        body: JSON.stringify({ agentDefinitionId }),
      }).then(handleResponse),
  },
};
