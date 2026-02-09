-- ============================================================
-- Migration 004: Agent Platform
-- Adds: credentials, tool_definitions, conversations, messages,
--        agent_definitions, telemetry_spans
-- Modifies: agent_tasks, nodes, writes (attribution columns)
-- Drops: old checkpoints table (LangGraph manages its own)
-- ============================================================

-- ── Credential Vault ─────────────────────────────────────

CREATE TYPE credential_type AS ENUM ('api_key', 'oauth2', 'smtp', 'basic_auth', 'custom');

CREATE TABLE credentials (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    service          TEXT NOT NULL DEFAULT '',          -- "openai", "smtp", "linkedin", "slack"
    type             credential_type NOT NULL,
    config_encrypted BYTEA NOT NULL,                   -- Fernet-encrypted JSON
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credentials_owner ON credentials(owner_id);
CREATE INDEX idx_credentials_service ON credentials(service);

-- ── Tool Definitions ─────────────────────────────────────

CREATE TYPE tool_type AS ENUM ('builtin', 'http', 'custom');

CREATE TABLE tool_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system-wide builtin
    name            TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    type            tool_type NOT NULL DEFAULT 'builtin',
    config          JSONB NOT NULL DEFAULT '{}',                  -- HTTP: {url, method, headers_template, body_template}
    credential_id   UUID REFERENCES credentials(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique name per scope: system-level builtins vs per-user customs
CREATE UNIQUE INDEX idx_tool_defs_name_system ON tool_definitions(name) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX idx_tool_defs_name_owner ON tool_definitions(owner_id, name) WHERE owner_id IS NOT NULL;

-- ── Conversations + Messages ─────────────────────────────

CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'tool');

CREATE TABLE conversations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title               TEXT NOT NULL DEFAULT 'New conversation',
    agent_definition_id UUID,                    -- FK added after agent_definitions table
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_owner ON conversations(owner_id, updated_at DESC);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            message_role NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    metadata        JSONB NOT NULL DEFAULT '{}',   -- tool_calls, token_count, model, etc.
    task_id         UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);

-- ── Agent Definitions (Configurable Agents) ──────────────

CREATE TYPE trigger_type AS ENUM ('manual', 'schedule', 'event');

CREATE TABLE agent_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    system_prompt   TEXT NOT NULL DEFAULT '',
    model           TEXT NOT NULL DEFAULT '',       -- empty = use workspace default
    tool_ids        UUID[] DEFAULT '{}',            -- empty = all active tools
    trigger         trigger_type NOT NULL DEFAULT 'manual',
    trigger_config  JSONB NOT NULL DEFAULT '{}',    -- {"cron": "0 9 * * MON"} or {"event": "communication.inbound"}
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_defs_owner ON agent_definitions(owner_id);
CREATE INDEX idx_agent_defs_trigger ON agent_definitions(trigger) WHERE is_active = true;

-- FK from conversations to agent_definitions
ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_agent_def
    FOREIGN KEY (agent_definition_id) REFERENCES agent_definitions(id) ON DELETE SET NULL;

-- ── Telemetry Spans (OpenTelemetry in PostgreSQL) ────────

CREATE TABLE telemetry_spans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id        TEXT NOT NULL,
    span_id         TEXT NOT NULL,
    parent_span_id  TEXT,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'INTERNAL',
    status          TEXT NOT NULL DEFAULT 'OK',
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ,
    duration_ms     DOUBLE PRECISION,              -- computed for fast queries
    attributes      JSONB NOT NULL DEFAULT '{}',
    events          JSONB NOT NULL DEFAULT '[]',
    task_id         UUID REFERENCES agent_tasks(id) ON DELETE CASCADE,
    owner_id        UUID REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_telemetry_trace ON telemetry_spans(trace_id);
CREATE INDEX idx_telemetry_task ON telemetry_spans(task_id);
CREATE INDEX idx_telemetry_time ON telemetry_spans(start_time DESC);
CREATE INDEX idx_telemetry_owner ON telemetry_spans(owner_id, start_time DESC);

-- ── Attribution ──────────────────────────────────────────

CREATE TYPE actor_type AS ENUM ('human', 'agent');

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS created_by_type actor_type NOT NULL DEFAULT 'human';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS created_by_task_id UUID REFERENCES agent_tasks(id) ON DELETE SET NULL;

ALTER TABLE writes ADD COLUMN IF NOT EXISTS actor_type actor_type NOT NULL DEFAULT 'agent';
ALTER TABLE writes ADD COLUMN IF NOT EXISTS actor_id UUID;  -- user_id or task_id depending on actor_type

-- ── Extend agent_tasks ───────────────────────────────────

ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS agent_definition_id UUID REFERENCES agent_definitions(id) ON DELETE SET NULL;

CREATE INDEX idx_agent_tasks_conversation ON agent_tasks(conversation_id);

-- ── Drop old checkpoints (LangGraph AsyncPostgresSaver manages its own) ──

DROP TABLE IF EXISTS checkpoints;

-- ── Triggers ─────────────────────────────────────────────

CREATE TRIGGER trg_credentials_updated_at
    BEFORE UPDATE ON credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tool_defs_updated_at
    BEFORE UPDATE ON tool_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_agent_defs_updated_at
    BEFORE UPDATE ON agent_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── NOTIFY for real-time ─────────────────────────────────

CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('new_message', json_build_object(
        'conversation_id', NEW.conversation_id,
        'role', NEW.role::text
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_notify
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION notify_new_message();

-- ── Grants to roka_backend ───────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON credentials TO roka_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON tool_definitions TO roka_backend;
GRANT SELECT, INSERT, UPDATE ON conversations TO roka_backend;
GRANT SELECT, INSERT ON messages TO roka_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_definitions TO roka_backend;
GRANT SELECT, INSERT ON telemetry_spans TO roka_backend;
