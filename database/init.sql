-- ============================================================
-- Roka: Schema  (PostgreSQL 15+ / pgvector)
-- Run once on a fresh PostgreSQL instance.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- Restricted backend role (Principle of Least Privilege)
-- The backend service uses this instead of superuser.
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'roka_backend') THEN
        CREATE ROLE roka_backend LOGIN;
    END IF;
END $$;

-- ============================================================
-- Zone A: Fixed Core  (Identity + Signal)
-- ============================================================

-- Enum: entity type
CREATE TYPE entity_type AS ENUM ('person', 'org', 'bot');

-- Enum: communication channel
CREATE TYPE comm_channel AS ENUM ('email', 'slack', 'sms', 'webhook', 'other');

-- Enum: direction
CREATE TYPE comm_direction AS ENUM ('inbound', 'outbound');

-- Entities: canonical "who"
CREATE TABLE entities (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name  TEXT NOT NULL,
    type          entity_type NOT NULL DEFAULT 'person',
    resolution_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    context_vector  vector(1536),
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIN index on resolution_keys for identity lookups
CREATE INDEX idx_entities_resolution_keys ON entities USING GIN (resolution_keys);
-- Trigram index on display_name for fuzzy search
CREATE INDEX idx_entities_display_name_trgm ON entities USING GIN (display_name gin_trgm_ops);

-- Communications: immutable signal log
CREATE TABLE communications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    channel         comm_channel NOT NULL,
    direction       comm_direction NOT NULL,
    from_entity_id  UUID REFERENCES entities(id) ON DELETE SET NULL,
    to_entity_ids   UUID[] DEFAULT '{}',
    subject         TEXT,
    content_text    TEXT,
    raw_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_communications_from ON communications (from_entity_id);
CREATE INDEX idx_communications_ts ON communications (timestamp DESC);

-- ============================================================
-- Zone B: Flexible Shell  (Nodes + Edges + DB Definitions)
-- ============================================================

-- Enum: node type
CREATE TYPE node_type AS ENUM ('page', 'database', 'database_row', 'image');

-- Nodes: atomic unit (page, database, database_row, image)
CREATE TABLE nodes (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id     UUID REFERENCES nodes(id) ON DELETE CASCADE,
    owner_id      UUID NOT NULL,
    type          node_type NOT NULL DEFAULT 'page',
    title         TEXT NOT NULL DEFAULT '',
    icon          TEXT DEFAULT NULL,
    cover_url     TEXT DEFAULT NULL,
    content       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- BlockNote editor state
    properties    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- user-defined fields
    is_pinned     BOOLEAN NOT NULL DEFAULT false,
    sort_order    INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Populated by trigger: extract text for full-text search
    search_text   TEXT NOT NULL DEFAULT ''
);

-- Trigger: rebuild search_text on INSERT or UPDATE of title/content
CREATE OR REPLACE FUNCTION nodes_build_search_text()
RETURNS TRIGGER AS $$
DECLARE
    content_text TEXT := '';
    block JSONB;
BEGIN
    -- Extract text from BlockNote JSON content array
    IF jsonb_typeof(NEW.content) = 'array' THEN
        FOR block IN SELECT * FROM jsonb_array_elements(NEW.content)
        LOOP
            -- BlockNote blocks have nested content[].text fields
            IF block ? 'content' AND jsonb_typeof(block->'content') = 'array' THEN
                content_text := content_text || ' ' || COALESCE(
                    (SELECT string_agg(elem->>'text', ' ')
                     FROM jsonb_array_elements(block->'content') AS elem
                     WHERE elem ? 'text'),
                    ''
                );
            END IF;
            -- Also check for plain text values
            IF block ? 'text' THEN
                content_text := content_text || ' ' || (block->>'text');
            END IF;
        END LOOP;
    END IF;

    NEW.search_text := LEFT(COALESCE(NEW.title, '') || ' ' || TRIM(content_text), 10000);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_nodes_search_text
    BEFORE INSERT OR UPDATE OF title, content ON nodes
    FOR EACH ROW EXECUTE FUNCTION nodes_build_search_text();

-- Full-text search index
CREATE INDEX idx_nodes_search_fts ON nodes USING GIN (to_tsvector('english', search_text));
-- Trigram index for fuzzy matching
CREATE INDEX idx_nodes_search_trgm ON nodes USING GIN (search_text gin_trgm_ops);
-- Tree navigation
CREATE INDEX idx_nodes_parent ON nodes (parent_id);
-- Owner filter
CREATE INDEX idx_nodes_owner ON nodes (owner_id);
-- Properties for dynamic queries
CREATE INDEX idx_nodes_properties ON nodes USING GIN (properties);
-- Recent pages
CREATE INDEX idx_nodes_updated ON nodes (updated_at DESC);
-- Type filter
CREATE INDEX idx_nodes_type ON nodes (type);

-- Edges: semantic links
CREATE TABLE edges (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id   UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id   UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    type        TEXT NOT NULL DEFAULT 'link',
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_id, target_id, type),
    CONSTRAINT edges_no_self_loop CHECK (source_id != target_id)
);

CREATE INDEX idx_edges_source ON edges (source_id);
CREATE INDEX idx_edges_target ON edges (target_id);

-- Database definitions: schema config for "database" type nodes
CREATE TABLE database_definitions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id       UUID NOT NULL UNIQUE REFERENCES nodes(id) ON DELETE CASCADE,
    schema_config JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- schema_config example:
    -- [
    --   {"key": "status", "name": "Status", "type": "select", "options": ["Todo","In Progress","Done"]},
    --   {"key": "priority", "name": "Priority", "type": "select", "options": ["Low","Medium","High"]},
    --   {"key": "due_date", "name": "Due Date", "type": "date"},
    --   {"key": "assignee", "name": "Assignee", "type": "person"}
    -- ]
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Database views: saved sort/filter/column-order per database
CREATE TABLE database_views (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    database_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT 'Default view',
    view_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- view_config shape:
    -- {
    --   "sorts": [{"columnKey": "status", "direction": "asc"}],
    --   "filters": [{"columnKey": "status", "operator": "is", "value": "Todo"}],
    --   "columnOrder": ["status", "priority", "due_date"],
    --   "hiddenColumns": []
    -- }
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Zone C: Agent State
-- ============================================================

-- Enum: agent task status
CREATE TYPE agent_task_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- Enum: workflow type
CREATE TYPE workflow_type AS ENUM ('summarize', 'triage', 'agent', 'custom');

-- Agent tasks: triggered workflows
CREATE TABLE agent_tasks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id      UUID NOT NULL,
    workflow      workflow_type NOT NULL,
    status        agent_task_status NOT NULL DEFAULT 'pending',
    input         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- e.g. {"node_id": "..."}
    output        JSONB,                                -- result payload
    error         TEXT,
    node_id       UUID REFERENCES nodes(id) ON DELETE SET NULL,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    heartbeat_at  TIMESTAMPTZ,                          -- updated periodically by worker
    trace_log     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- execution audit trail (tool calls/reasoning)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_tasks_status ON agent_tasks (status);
CREATE INDEX idx_agent_tasks_owner ON agent_tasks (owner_id);
-- Partial index for the poller query (pending tasks by creation order)
CREATE INDEX idx_agent_tasks_pending ON agent_tasks (created_at ASC) WHERE status = 'pending';
-- Partial index for stale running task cleanup
CREATE INDEX idx_agent_tasks_running ON agent_tasks (heartbeat_at ASC) WHERE status = 'running';

-- Checkpoints: LangGraph serialized state
CREATE TABLE checkpoints (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id       UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    thread_id     TEXT NOT NULL,
    checkpoint    JSONB NOT NULL,
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkpoints_task ON checkpoints (task_id);
CREATE INDEX idx_checkpoints_thread ON checkpoints (thread_id);

-- Writes: agent modification audit log
CREATE TABLE writes (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id       UUID REFERENCES agent_tasks(id) ON DELETE SET NULL,
    table_name    TEXT NOT NULL,
    row_id        UUID NOT NULL,
    operation     TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data      JSONB,
    new_data      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_writes_task ON writes (task_id);

-- ============================================================
-- Zone D: App Settings  (key-value config, LLM credentials)
-- ============================================================

CREATE TABLE app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL DEFAULT '',
    is_secret   BOOLEAN NOT NULL DEFAULT false,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed defaults
INSERT INTO app_settings (key, value, is_secret) VALUES
    ('setup_complete', 'false', false),
    ('llm_provider', 'openai', false),
    ('llm_model', 'gpt-4o', false),
    ('llm_api_key', '', true),
    ('llm_api_base', '', false),
    ('llm_configured', 'false', false);

-- ============================================================
-- LISTEN/NOTIFY: wake the backend poller on new tasks
-- ============================================================

CREATE OR REPLACE FUNCTION notify_new_task()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('new_task', NEW.id::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_tasks_notify
    AFTER INSERT ON agent_tasks
    FOR EACH ROW EXECUTE FUNCTION notify_new_task();

-- ============================================================
-- Updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entities_updated_at
    BEFORE UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_nodes_updated_at
    BEFORE UPDATE ON nodes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_database_definitions_updated_at
    BEFORE UPDATE ON database_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_agent_tasks_updated_at
    BEFORE UPDATE ON agent_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_app_settings_updated_at
    BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_database_views_updated_at
    BEFORE UPDATE ON database_views FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Auth.js tables (application-managed auth)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT,
    email           TEXT NOT NULL UNIQUE,
    email_verified  TIMESTAMPTZ,
    image           TEXT,
    password_hash   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                TEXT NOT NULL,
    provider            TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    refresh_token       TEXT,
    access_token        TEXT,
    expires_at          INTEGER,
    token_type          TEXT,
    scope               TEXT,
    id_token            TEXT,
    session_state       TEXT,
    PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    session_token TEXT PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires       TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier TEXT NOT NULL,
    token      TEXT NOT NULL,
    expires    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- FK: nodes.owner_id -> users
ALTER TABLE nodes ADD CONSTRAINT fk_nodes_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE agent_tasks ADD CONSTRAINT fk_agent_tasks_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Files: object storage metadata (blobs in S3/SeaweedFS)
-- ============================================================

CREATE TABLE files (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_id     UUID REFERENCES nodes(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
    size_bytes  BIGINT NOT NULL DEFAULT 0,
    s3_key      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_files_owner ON files (owner_id);
CREATE INDEX idx_files_node ON files (node_id);

-- ============================================================
-- RPC: Full-text search (accepts user_id as parameter)
-- ============================================================

CREATE OR REPLACE FUNCTION search_nodes(
    p_user_id UUID,
    search_query TEXT,
    result_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    type node_type,
    parent_id UUID,
    snippet TEXT,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id, n.title, n.type, n.parent_id,
        ts_headline('english', n.search_text, plainto_tsquery('english', search_query),
            'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') AS snippet,
        ts_rank(to_tsvector('english', n.search_text), plainto_tsquery('english', search_query)) AS rank
    FROM nodes n
    WHERE n.owner_id = p_user_id
      AND to_tsvector('english', n.search_text) @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION search_nodes_fuzzy(
    p_user_id UUID,
    search_query TEXT,
    result_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    type node_type,
    parent_id UUID,
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id, n.title, n.type, n.parent_id,
        similarity(n.search_text, search_query) AS similarity
    FROM nodes n
    WHERE n.owner_id = p_user_id
      AND n.search_text % search_query
    ORDER BY similarity DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Grant permissions to roka_backend role
-- Only the tables/operations the backend actually needs.
-- ============================================================

GRANT USAGE ON SCHEMA public TO roka_backend;

-- agent_tasks: claim, update status, read
GRANT SELECT, UPDATE ON agent_tasks TO roka_backend;

-- nodes: read for workflows, update properties, insert children (triage)
GRANT SELECT, INSERT, UPDATE ON nodes TO roka_backend;

-- writes: insert audit log entries
GRANT INSERT ON writes TO roka_backend;

-- edges: create links from triage workflow
GRANT SELECT, INSERT ON edges TO roka_backend;

-- entities: resolve/create from webhooks
GRANT SELECT, INSERT ON entities TO roka_backend;

-- communications: insert from webhooks
GRANT INSERT ON communications TO roka_backend;

-- app_settings: read LLM config
GRANT SELECT ON app_settings TO roka_backend;

-- checkpoints: save/load workflow state
GRANT SELECT, INSERT, UPDATE ON checkpoints TO roka_backend;

-- files: read for workflows (future: agent processes attachments)
GRANT SELECT ON files TO roka_backend;

-- ============================================================
-- Baseline extension (agent platform schema)
-- Keep init + migrations in sync during dev reset history.
-- ============================================================
\i /migrations/001_baseline.sql
