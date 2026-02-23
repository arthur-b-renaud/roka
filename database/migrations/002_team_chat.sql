-- ============================================================
-- 002: Team system + internal chat
-- Single-team deployment model with owner/admin/member roles.
-- ============================================================

-- ── Enum ────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_role') THEN
        CREATE TYPE team_role AS ENUM ('owner', 'admin', 'member');
    END IF;
END $$;

-- ── Teams ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT NOT NULL DEFAULT 'My Workspace',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_teams_updated_at
    BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Team Members ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       team_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_team_user
    ON team_members(team_id, user_id);

CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- ── Team Messages (internal chat) ──────────────────────────
CREATE TABLE IF NOT EXISTS team_messages (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_messages_team_created
    ON team_messages(team_id, created_at);

-- ── NOTIFY for real-time chat ──────────────────────────────
CREATE OR REPLACE FUNCTION notify_team_chat()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('team_chat', json_build_object(
        'team_id', NEW.team_id,
        'user_id', NEW.user_id
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_team_messages_notify
    AFTER INSERT ON team_messages
    FOR EACH ROW EXECUTE FUNCTION notify_team_chat();

-- ── Grants to roka_backend ─────────────────────────────────
GRANT SELECT ON teams TO roka_backend;
GRANT SELECT ON team_members TO roka_backend;
GRANT SELECT ON team_messages TO roka_backend;
