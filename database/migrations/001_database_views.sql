-- Migration: Add database_views table for saved views (sort, filter, column order)

CREATE TABLE IF NOT EXISTS database_views (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    database_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT 'Default view',
    view_config     JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE database_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY views_select ON database_views FOR SELECT
    USING (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = database_views.database_id AND nodes.owner_id = auth.uid()));
CREATE POLICY views_insert ON database_views FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = database_views.database_id AND nodes.owner_id = auth.uid()));
CREATE POLICY views_update ON database_views FOR UPDATE
    USING (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = database_views.database_id AND nodes.owner_id = auth.uid()));
CREATE POLICY views_delete ON database_views FOR DELETE
    USING (EXISTS (SELECT 1 FROM nodes WHERE nodes.id = database_views.database_id AND nodes.owner_id = auth.uid()));

CREATE TRIGGER trg_database_views_updated_at
    BEFORE UPDATE ON database_views FOR EACH ROW EXECUTE FUNCTION update_updated_at();
