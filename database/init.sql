-- ============================================================
-- Roka: Hybrid Schema  (PostgreSQL 15+)
-- Run once on a fresh Supabase/PG instance.
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
    owner_id      UUID NOT NULL,                       -- auth.uid()
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
    ('llm_configured', 'false', false),
    ('smtp_host', '', false),
    ('smtp_port', '587', false),
    ('smtp_user', '', false),
    ('smtp_password', '', true),
    ('smtp_from_email', '', false);

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

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE database_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE writes ENABLE ROW LEVEL SECURITY;

-- Nodes: users see their own nodes
CREATE POLICY nodes_select ON nodes FOR SELECT
    USING (auth.uid() = owner_id);
CREATE POLICY nodes_insert ON nodes FOR INSERT
    WITH CHECK (auth.uid() = owner_id);
CREATE POLICY nodes_update ON nodes FOR UPDATE
    USING (auth.uid() = owner_id);
CREATE POLICY nodes_delete ON nodes FOR DELETE
    USING (auth.uid() = owner_id);

-- Edges: accessible if user owns both source and target nodes
CREATE POLICY edges_select ON edges FOR SELECT
    USING (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = edges.source_id AND nodes.owner_id = auth.uid()));
CREATE POLICY edges_insert ON edges FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM nodes WHERE nodes.id = edges.source_id AND nodes.owner_id = auth.uid())
        AND EXISTS (SELECT 1 FROM nodes WHERE nodes.id = edges.target_id AND nodes.owner_id = auth.uid())
    );
CREATE POLICY edges_update ON edges FOR UPDATE
    USING (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = edges.source_id AND nodes.owner_id = auth.uid()));
CREATE POLICY edges_delete ON edges FOR DELETE
    USING (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = edges.source_id AND nodes.owner_id = auth.uid()));

-- Database definitions: accessible if user owns the parent node
CREATE POLICY db_defs_select ON database_definitions FOR SELECT
    USING (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = database_definitions.node_id AND nodes.owner_id = auth.uid()));
CREATE POLICY db_defs_insert ON database_definitions FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = database_definitions.node_id AND nodes.owner_id = auth.uid()));
CREATE POLICY db_defs_update ON database_definitions FOR UPDATE
    USING (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = database_definitions.node_id AND nodes.owner_id = auth.uid()));
CREATE POLICY db_defs_delete ON database_definitions FOR DELETE
    USING (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = database_definitions.node_id AND nodes.owner_id = auth.uid()));

-- Entities: read for all authenticated, write via service_role only
CREATE POLICY entities_select ON entities FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY entities_insert ON entities FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
CREATE POLICY entities_update ON entities FOR UPDATE
    USING (auth.role() = 'service_role');
CREATE POLICY entities_delete ON entities FOR DELETE
    USING (auth.role() = 'service_role');

-- Communications: read for authenticated, write via service_role
CREATE POLICY comms_select ON communications FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY comms_insert ON communications FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- Agent tasks: users see their own
CREATE POLICY tasks_select ON agent_tasks FOR SELECT
    USING (auth.uid() = owner_id);
CREATE POLICY tasks_insert ON agent_tasks FOR INSERT
    WITH CHECK (auth.uid() = owner_id);
CREATE POLICY tasks_update_service ON agent_tasks FOR UPDATE
    USING (auth.role() = 'service_role');

-- Checkpoints & writes: service_role only (agent internal)
CREATE POLICY checkpoints_all ON checkpoints FOR ALL
    USING (auth.role() = 'service_role');
CREATE POLICY writes_all ON writes FOR ALL
    USING (auth.role() = 'service_role');

-- App settings: anon can read non-secret rows (setup_complete check before auth)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_anon_read ON app_settings FOR SELECT
    USING (NOT is_secret);
CREATE POLICY app_settings_auth_read ON app_settings FOR SELECT
    USING (auth.role() = 'authenticated' AND NOT is_secret);
CREATE POLICY app_settings_auth_update ON app_settings FOR UPDATE
    USING (
        auth.role() = 'authenticated'
        AND key IN (
            'setup_complete', 'llm_provider', 'llm_model', 'llm_api_base', 'llm_api_key', 'llm_configured',
            'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email'
        )
    )
    WITH CHECK (
        key IN (
            'setup_complete', 'llm_provider', 'llm_model', 'llm_api_base', 'llm_api_key', 'llm_configured',
            'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email'
        )
        AND (
            (key IN ('llm_api_key', 'smtp_password') AND is_secret = true)
            OR (key NOT IN ('llm_api_key', 'smtp_password') AND is_secret = false)
        )
    );
CREATE POLICY app_settings_auth_insert ON app_settings FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND key IN (
            'setup_complete', 'llm_provider', 'llm_model', 'llm_api_base', 'llm_api_key', 'llm_configured',
            'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email'
        )
        AND (
            (key IN ('llm_api_key', 'smtp_password') AND is_secret = true)
            OR (key NOT IN ('llm_api_key', 'smtp_password') AND is_secret = false)
        )
    );
CREATE POLICY app_settings_service_all ON app_settings FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- RPC: Full-text search across nodes
-- Uses auth.uid() internally so callers cannot search other users' data.
-- ============================================================

CREATE OR REPLACE FUNCTION search_nodes(
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
DECLARE
    current_user_id UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.title,
        n.type,
        n.parent_id,
        ts_headline('english', n.search_text, plainto_tsquery('english', search_query),
            'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') AS snippet,
        ts_rank(to_tsvector('english', n.search_text), plainto_tsquery('english', search_query)) AS rank
    FROM nodes n
    WHERE n.owner_id = current_user_id
      AND to_tsvector('english', n.search_text) @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fuzzy search fallback (trigram)
CREATE OR REPLACE FUNCTION search_nodes_fuzzy(
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
DECLARE
    current_user_id UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.title,
        n.type,
        n.parent_id,
        similarity(n.search_text, search_query) AS similarity
    FROM nodes n
    WHERE n.owner_id = current_user_id
      AND n.search_text % search_query
    ORDER BY similarity DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
