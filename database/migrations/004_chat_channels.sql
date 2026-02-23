-- ============================================================
-- 004: Chat channels + direct conversations
-- Adds Slack-like channel + DM model for team chat.
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chat_channel_kind') THEN
        CREATE TYPE chat_channel_kind AS ENUM ('channel', 'direct');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS chat_channels (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    kind        chat_channel_kind NOT NULL DEFAULT 'channel',
    name        TEXT,
    dm_key      TEXT,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chat_channels_name_required_for_channel
        CHECK ((kind = 'channel' AND name IS NOT NULL) OR kind = 'direct')
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_team ON chat_channels(team_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channels_dm_key ON chat_channels(dm_key) WHERE dm_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channels_team_name ON chat_channels(team_id, lower(name)) WHERE kind = 'channel';

CREATE TABLE IF NOT EXISTS chat_channel_members (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id  UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channel_members_channel_user
    ON chat_channel_members(channel_id, user_id);
CREATE INDEX IF NOT EXISTS idx_chat_channel_members_user ON chat_channel_members(user_id);

CREATE TABLE IF NOT EXISTS chat_channel_messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id  UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_channel_messages_channel_created
    ON chat_channel_messages(channel_id, created_at);

CREATE TRIGGER trg_chat_channels_updated_at
    BEFORE UPDATE ON chat_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill a default #general channel per team.
WITH created AS (
    INSERT INTO chat_channels (team_id, kind, name)
    SELECT t.id, 'channel', 'general'
    FROM teams t
    WHERE NOT EXISTS (
        SELECT 1 FROM chat_channels c
        WHERE c.team_id = t.id AND c.kind = 'channel' AND lower(c.name) = 'general'
    )
    RETURNING id, team_id
), all_general AS (
    SELECT c.id, c.team_id
    FROM chat_channels c
    WHERE c.kind = 'channel' AND lower(c.name) = 'general'
)
INSERT INTO chat_channel_members (channel_id, user_id)
SELECT g.id, tm.user_id
FROM all_general g
JOIN team_members tm ON tm.team_id = g.team_id
ON CONFLICT DO NOTHING;

GRANT SELECT ON chat_channels TO roka_backend;
GRANT SELECT ON chat_channel_members TO roka_backend;
GRANT SELECT ON chat_channel_messages TO roka_backend;
