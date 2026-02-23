-- ============================================================
-- 003: Node revision history with intelligent squashing
-- Tracks INSERT/UPDATE/DELETE on nodes with actor attribution.
-- Consecutive edits by the same actor within 15 min are squashed
-- into a single revision (Google Docs-style).
-- ============================================================

CREATE TABLE IF NOT EXISTS node_revisions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id         UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    operation       TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data        JSONB,
    new_data        JSONB,
    changed_fields  TEXT[],
    actor_type      TEXT NOT NULL DEFAULT 'system',
    actor_id        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_node_revisions_node_created
    ON node_revisions (node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_node_revisions_node_updated
    ON node_revisions (node_id, updated_at DESC);

-- ── Trigger function ────────────────────────────────────────

CREATE OR REPLACE FUNCTION track_node_revision()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_type  TEXT;
    v_actor_id    TEXT;
    v_changed     TEXT[] := '{}';
    v_existing_id UUID;
    v_squash_window INTERVAL := interval '15 minutes';
BEGIN
    v_actor_type := COALESCE(current_setting('roka.actor_type', true), 'system');
    v_actor_id   := current_setting('roka.actor_id', true);

    IF TG_OP = 'UPDATE' THEN
        -- Compute changed fields (exclude derived/auto columns)
        IF OLD.title         IS DISTINCT FROM NEW.title         THEN v_changed := array_append(v_changed, 'title');      END IF;
        IF OLD.content       IS DISTINCT FROM NEW.content       THEN v_changed := array_append(v_changed, 'content');    END IF;
        IF OLD.properties    IS DISTINCT FROM NEW.properties    THEN v_changed := array_append(v_changed, 'properties'); END IF;
        IF OLD.icon          IS DISTINCT FROM NEW.icon          THEN v_changed := array_append(v_changed, 'icon');       END IF;
        IF OLD.cover_url     IS DISTINCT FROM NEW.cover_url     THEN v_changed := array_append(v_changed, 'cover_url');  END IF;
        IF OLD.parent_id     IS DISTINCT FROM NEW.parent_id     THEN v_changed := array_append(v_changed, 'parent_id');  END IF;
        IF OLD.type          IS DISTINCT FROM NEW.type          THEN v_changed := array_append(v_changed, 'type');       END IF;
        IF OLD.is_pinned     IS DISTINCT FROM NEW.is_pinned     THEN v_changed := array_append(v_changed, 'is_pinned');  END IF;
        IF OLD.sort_order    IS DISTINCT FROM NEW.sort_order    THEN v_changed := array_append(v_changed, 'sort_order'); END IF;

        -- Skip if nothing meaningful changed
        IF array_length(v_changed, 1) IS NULL THEN
            RETURN NEW;
        END IF;

        -- Try to squash into the most recent revision for same node + actor
        SELECT id INTO v_existing_id
        FROM node_revisions
        WHERE node_id    = NEW.id
          AND operation  = 'UPDATE'
          AND actor_type = v_actor_type
          AND actor_id  IS NOT DISTINCT FROM v_actor_id
          AND updated_at > now() - v_squash_window
        ORDER BY updated_at DESC
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            UPDATE node_revisions
            SET new_data       = to_jsonb(NEW),
                changed_fields = (
                    SELECT array_agg(DISTINCT f)
                    FROM unnest(COALESCE(changed_fields, '{}'::text[]) || v_changed) AS f
                ),
                updated_at     = now()
            WHERE id = v_existing_id;
            RETURN NEW;
        END IF;

        INSERT INTO node_revisions (node_id, operation, old_data, new_data, changed_fields, actor_type, actor_id)
        VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_changed, v_actor_type, v_actor_id);

    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO node_revisions (node_id, operation, new_data, actor_type, actor_id)
        VALUES (NEW.id, 'INSERT', to_jsonb(NEW), v_actor_type, v_actor_id);

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO node_revisions (node_id, operation, old_data, actor_type, actor_id)
        VALUES (OLD.id, 'DELETE', to_jsonb(OLD), v_actor_type, v_actor_id);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nodes_revision ON nodes;
CREATE TRIGGER trg_nodes_revision
    AFTER INSERT OR UPDATE OR DELETE ON nodes
    FOR EACH ROW EXECUTE FUNCTION track_node_revision();

-- ── Grants ──────────────────────────────────────────────────

GRANT SELECT ON node_revisions TO roka_backend;
