-- ============================================================
-- Roka: Hybrid Schema  (PostgreSQL 15+)
-- Run once on a fresh Supabase/PG instance.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

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
    sort_order    INTEGER NOT NULL DEFAULT 0,
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

    NEW.search_text := COALESCE(NEW.title, '') || ' ' || TRIM(content_text);
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
    UNIQUE(source_id, target_id, type)
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
CREATE TYPE workflow_type AS ENUM ('summarize', 'triage', 'custom');

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
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_tasks_status ON agent_tasks (status);
CREATE INDEX idx_agent_tasks_owner ON agent_tasks (owner_id);

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
    operation     TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
    old_data      JSONB,
    new_data      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_writes_task ON writes (task_id);

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

-- Edges: accessible if user owns the source node
CREATE POLICY edges_select ON edges FOR SELECT
    USING (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = edges.source_id AND nodes.owner_id = auth.uid()));
CREATE POLICY edges_insert ON edges FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = edges.source_id AND nodes.owner_id = auth.uid()));
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
CREATE POLICY tasks_update ON agent_tasks FOR UPDATE
    USING (auth.uid() = owner_id);

-- Checkpoints & writes: service_role only (agent internal)
CREATE POLICY checkpoints_all ON checkpoints FOR ALL
    USING (auth.role() = 'service_role');
CREATE POLICY writes_all ON writes FOR ALL
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
