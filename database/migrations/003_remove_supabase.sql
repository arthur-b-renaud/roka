-- ============================================================
-- Migration 003: Remove Supabase dependencies
-- Adds Auth.js tables, drops all RLS policies, updates search_nodes.
-- ============================================================

-- ── Auth.js Tables ─────────────────────────────────────

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

-- ── Update FK references ───────────────────────────────
-- nodes.owner_id now references public.users instead of auth.users
-- agent_tasks.owner_id now references public.users

-- (These FKs were implicit before via Supabase auth.users; 
--  we add explicit constraints after creating the users table)

-- ── Drop all RLS policies ──────────────────────────────

-- Nodes
DROP POLICY IF EXISTS nodes_select ON nodes;
DROP POLICY IF EXISTS nodes_insert ON nodes;
DROP POLICY IF EXISTS nodes_update ON nodes;
DROP POLICY IF EXISTS nodes_delete ON nodes;

-- Edges
DROP POLICY IF EXISTS edges_select ON edges;
DROP POLICY IF EXISTS edges_insert ON edges;
DROP POLICY IF EXISTS edges_update ON edges;
DROP POLICY IF EXISTS edges_delete ON edges;

-- Database definitions
DROP POLICY IF EXISTS db_defs_select ON database_definitions;
DROP POLICY IF EXISTS db_defs_insert ON database_definitions;
DROP POLICY IF EXISTS db_defs_update ON database_definitions;
DROP POLICY IF EXISTS db_defs_delete ON database_definitions;

-- Database views
DROP POLICY IF EXISTS views_select ON database_views;
DROP POLICY IF EXISTS views_insert ON database_views;
DROP POLICY IF EXISTS views_update ON database_views;
DROP POLICY IF EXISTS views_delete ON database_views;

-- Entities
DROP POLICY IF EXISTS entities_select ON entities;
DROP POLICY IF EXISTS entities_insert ON entities;
DROP POLICY IF EXISTS entities_update ON entities;
DROP POLICY IF EXISTS entities_delete ON entities;

-- Communications
DROP POLICY IF EXISTS comms_select ON communications;
DROP POLICY IF EXISTS comms_insert ON communications;

-- Agent tasks
DROP POLICY IF EXISTS tasks_select ON agent_tasks;
DROP POLICY IF EXISTS tasks_insert ON agent_tasks;
DROP POLICY IF EXISTS tasks_update_service ON agent_tasks;

-- Checkpoints & writes
DROP POLICY IF EXISTS checkpoints_all ON checkpoints;
DROP POLICY IF EXISTS writes_all ON writes;

-- App settings
DROP POLICY IF EXISTS app_settings_anon_read ON app_settings;
DROP POLICY IF EXISTS app_settings_auth_read ON app_settings;
DROP POLICY IF EXISTS app_settings_auth_update ON app_settings;
DROP POLICY IF EXISTS app_settings_auth_insert ON app_settings;
DROP POLICY IF EXISTS app_settings_service_all ON app_settings;

-- ── Disable RLS on all tables ──────────────────────────

ALTER TABLE nodes DISABLE ROW LEVEL SECURITY;
ALTER TABLE edges DISABLE ROW LEVEL SECURITY;
ALTER TABLE database_definitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE database_views DISABLE ROW LEVEL SECURITY;
ALTER TABLE entities DISABLE ROW LEVEL SECURITY;
ALTER TABLE communications DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoints DISABLE ROW LEVEL SECURITY;
ALTER TABLE writes DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

-- ── Update search_nodes to accept user_id param ────────

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
        n.id,
        n.title,
        n.type,
        n.parent_id,
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

-- Update fuzzy search similarly
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
        n.id,
        n.title,
        n.type,
        n.parent_id,
        similarity(n.search_text, search_query) AS similarity
    FROM nodes n
    WHERE n.owner_id = p_user_id
      AND n.search_text % search_query
    ORDER BY similarity DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- ── Updated_at trigger for users ───────────────────────

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
