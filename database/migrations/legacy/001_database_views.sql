-- Migration 001: Add database_views table for saved views (sort, filter, column order)
-- Note: RLS removed — auth is now application-level via Auth.js.

CREATE TABLE IF NOT EXISTS database_views (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    database_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT 'Default view',
    view_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_database_views_updated_at
    BEFORE UPDATE ON database_views FOR EACH ROW EXECUTE FUNCTION update_updated_at();
