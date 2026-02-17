-- ============================================================
-- Baseline migration (reset history for dev)
-- Applies post-init schema for agent platform features.
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credential_type') THEN
        CREATE TYPE credential_type AS ENUM ('api_key', 'oauth2', 'basic_auth', 'custom');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tool_type') THEN
        CREATE TYPE tool_type AS ENUM ('builtin', 'http', 'custom', 'platform');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_role') THEN
        CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'tool');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trigger_type') THEN
        CREATE TYPE trigger_type AS ENUM ('manual', 'schedule', 'event');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'actor_type') THEN
        CREATE TYPE actor_type AS ENUM ('human', 'agent');
    END IF;
END $$;

-- ── Credentials + Tools ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS credentials (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    service          TEXT NOT NULL DEFAULT '',
    type             credential_type NOT NULL,
    config_encrypted BYTEA NOT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credentials_owner ON credentials(owner_id);
CREATE INDEX IF NOT EXISTS idx_credentials_service ON credentials(service);

CREATE TABLE IF NOT EXISTS tool_definitions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id        UUID REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    type            tool_type NOT NULL DEFAULT 'builtin',
    config          JSONB NOT NULL DEFAULT '{}',
    credential_id   UUID REFERENCES credentials(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_defs_name_system
ON tool_definitions(name) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_defs_name_owner
ON tool_definitions(owner_id, name) WHERE owner_id IS NOT NULL;

-- ── Agents + Conversations ───────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_definitions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    system_prompt   TEXT NOT NULL DEFAULT '',
    model           TEXT NOT NULL DEFAULT '',
    tool_ids        UUID[] DEFAULT '{}',
    trigger         trigger_type NOT NULL DEFAULT 'manual',
    trigger_config  JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_defs_owner ON agent_definitions(owner_id);
CREATE INDEX IF NOT EXISTS idx_agent_defs_trigger ON agent_definitions(trigger) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS conversations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title               TEXT NOT NULL DEFAULT 'New conversation',
    agent_definition_id UUID REFERENCES agent_definitions(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_owner ON conversations(owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            message_role NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    metadata        JSONB NOT NULL DEFAULT '{}',
    task_id         UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at ASC);

-- extend agent_tasks with linkage columns
ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_definition_id UUID REFERENCES agent_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_conversation ON agent_tasks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_owner_created ON agent_tasks (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_created ON agent_tasks (status, created_at DESC);

-- ── Telemetry ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telemetry_spans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id        TEXT NOT NULL,
    span_id         TEXT NOT NULL,
    parent_span_id  TEXT,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'INTERNAL',
    status          TEXT NOT NULL DEFAULT 'OK',
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ,
    duration_ms     DOUBLE PRECISION,
    attributes      JSONB NOT NULL DEFAULT '{}',
    events          JSONB NOT NULL DEFAULT '[]',
    task_id         UUID REFERENCES agent_tasks(id) ON DELETE CASCADE,
    owner_id        UUID REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telemetry_trace ON telemetry_spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_task ON telemetry_spans(task_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_spans(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_owner ON telemetry_spans(owner_id, start_time DESC);

-- ── Attribution columns ──────────────────────────────────────
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS created_by_type actor_type NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS created_by_task_id UUID REFERENCES agent_tasks(id) ON DELETE SET NULL;

ALTER TABLE writes
  ADD COLUMN IF NOT EXISTS actor_type actor_type NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS actor_id UUID;

-- ── Remove obsolete table from pre-langgraph stack ───────────
DROP TABLE IF EXISTS checkpoints;

-- ── Triggers ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_credentials_updated_at ON credentials;
CREATE TRIGGER trg_credentials_updated_at
    BEFORE UPDATE ON credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_tool_defs_updated_at ON tool_definitions;
CREATE TRIGGER trg_tool_defs_updated_at
    BEFORE UPDATE ON tool_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_agent_defs_updated_at ON agent_definitions;
CREATE TRIGGER trg_agent_defs_updated_at
    BEFORE UPDATE ON agent_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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

DROP TRIGGER IF EXISTS trg_messages_notify ON messages;
CREATE TRIGGER trg_messages_notify
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION notify_new_message();

-- ── Composite indexes (from prior optimization migration) ───
CREATE INDEX IF NOT EXISTS idx_nodes_owner_parent_type_updated
ON nodes (owner_id, parent_id, type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_owner_parent_type_sort
ON nodes (owner_id, parent_id, type, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_sort
ON nodes (parent_id, sort_order ASC)
WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_database_views_database_sort
ON database_views (database_id, sort_order ASC);

-- ── Cleanup deprecated app settings rows ──────────────────────
DELETE FROM app_settings
WHERE key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email');

-- ── Grants ───────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON credentials TO roka_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON tool_definitions TO roka_backend;
GRANT SELECT, INSERT, UPDATE ON conversations TO roka_backend;
GRANT SELECT, INSERT ON messages TO roka_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_definitions TO roka_backend;
GRANT SELECT, INSERT ON telemetry_spans TO roka_backend;
