-- Unified Team Members: merge agent_definitions into team_members.
-- Every workspace participant (human or AI) becomes a single row in team_members.

-- New enums
CREATE TYPE member_kind AS ENUM ('human', 'ai');
CREATE TYPE page_access_level AS ENUM ('all', 'selected');

-- ── Extend team_members ────────────────────────────────
ALTER TABLE team_members
  ADD COLUMN kind          member_kind NOT NULL DEFAULT 'human',
  ADD COLUMN display_name  TEXT NOT NULL DEFAULT '',
  ADD COLUMN avatar_url    TEXT,
  ADD COLUMN description   TEXT NOT NULL DEFAULT '',
  -- Permissions
  ADD COLUMN page_access   page_access_level NOT NULL DEFAULT 'all',
  ADD COLUMN allowed_node_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN can_write     BOOLEAN NOT NULL DEFAULT true,
  -- AI config (defaults are inert for humans)
  ADD COLUMN system_prompt TEXT NOT NULL DEFAULT '',
  ADD COLUMN model         TEXT NOT NULL DEFAULT '',
  ADD COLUMN tool_ids      UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN trigger       trigger_type NOT NULL DEFAULT 'manual',
  ADD COLUMN trigger_config JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN is_active     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

-- Make user_id nullable (AI members have no user account)
ALTER TABLE team_members ALTER COLUMN user_id DROP NOT NULL;

-- Drop the old unique index and recreate allowing nulls
DROP INDEX IF EXISTS uq_team_members_team_user;
CREATE UNIQUE INDEX uq_team_members_team_user
  ON team_members (team_id, user_id)
  WHERE user_id IS NOT NULL;

-- Backfill display_name for existing human members
UPDATE team_members tm
SET display_name = COALESCE(u.name, split_part(u.email, '@', 1))
FROM users u
WHERE tm.user_id = u.id AND tm.kind = 'human';

-- ── Migrate agent_definitions into team_members ────────
INSERT INTO team_members (
  team_id, kind, display_name, description,
  system_prompt, model, tool_ids, trigger, trigger_config,
  is_active, created_at, updated_at
)
SELECT
  (SELECT id FROM teams LIMIT 1),
  'ai',
  ad.name,
  ad.description,
  ad.system_prompt,
  ad.model,
  COALESCE(ad.tool_ids::uuid[], '{}'),
  ad.trigger,
  ad.trigger_config,
  ad.is_active,
  ad.created_at,
  ad.updated_at
FROM agent_definitions ad
WHERE EXISTS (SELECT 1 FROM teams LIMIT 1);

-- ── Add member_id FK columns alongside old columns ─────

ALTER TABLE conversations
  ADD COLUMN member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

ALTER TABLE agent_tasks
  ADD COLUMN member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

ALTER TABLE chat_channel_messages
  ADD COLUMN author_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

-- Backfill member_id from agent_definition_id where possible
UPDATE conversations c
SET member_id = tm.id
FROM team_members tm
WHERE tm.kind = 'ai'
  AND tm.display_name = (
    SELECT ad.name FROM agent_definitions ad WHERE ad.id = c.agent_definition_id
  )
  AND c.agent_definition_id IS NOT NULL;

UPDATE agent_tasks at2
SET member_id = tm.id
FROM team_members tm
WHERE tm.kind = 'ai'
  AND tm.display_name = (
    SELECT ad.name FROM agent_definitions ad WHERE ad.id = at2.agent_definition_id
  )
  AND at2.agent_definition_id IS NOT NULL;

-- Backfill author_member_id for chat messages
-- Bot messages: match via agent_definition_id -> team_members
UPDATE chat_channel_messages ccm
SET author_member_id = tm.id
FROM team_members tm
WHERE tm.kind = 'ai'
  AND tm.display_name = (
    SELECT ad.name FROM agent_definitions ad WHERE ad.id = ccm.agent_definition_id
  )
  AND ccm.agent_definition_id IS NOT NULL;

-- Human messages: match via user_id -> team_members
UPDATE chat_channel_messages ccm
SET author_member_id = tm.id
FROM team_members tm
WHERE tm.kind = 'human'
  AND tm.user_id = ccm.user_id
  AND ccm.agent_definition_id IS NULL;

-- ── Update chat_channel_members to use member_id ───────

ALTER TABLE chat_channel_members
  ADD COLUMN member_id UUID REFERENCES team_members(id) ON DELETE CASCADE;

-- Backfill member_id from user_id
UPDATE chat_channel_members ccm
SET member_id = tm.id
FROM team_members tm
WHERE tm.user_id = ccm.user_id;

-- Migrate chat_channel_agents into chat_channel_members
INSERT INTO chat_channel_members (channel_id, member_id, created_at)
SELECT cca.channel_id, tm.id, cca.created_at
FROM chat_channel_agents cca
JOIN team_members tm ON tm.kind = 'ai'
  AND tm.display_name = (
    SELECT ad.name FROM agent_definitions ad WHERE ad.id = cca.agent_definition_id
  )
ON CONFLICT DO NOTHING;

-- ── Drop old columns and tables ────────────────────────

ALTER TABLE conversations DROP COLUMN agent_definition_id;
ALTER TABLE agent_tasks DROP COLUMN agent_definition_id;
ALTER TABLE chat_channel_messages DROP COLUMN agent_definition_id;

-- chat_channel_members: drop old user_id column, rename member_id
ALTER TABLE chat_channel_members DROP COLUMN user_id;

-- Drop the old unique index and recreate for member_id
DROP INDEX IF EXISTS uq_chat_channel_members_channel_user;
CREATE UNIQUE INDEX uq_chat_channel_members_channel_member
  ON chat_channel_members (channel_id, member_id);

-- Drop chat_channel_agents (now redundant)
DROP TABLE IF EXISTS chat_channel_agents;

-- Drop agent_definitions
DROP TABLE IF EXISTS agent_definitions;

-- ── Indexes ────────────────────────────────────────────

CREATE INDEX idx_team_members_kind ON team_members (kind);
CREATE INDEX idx_team_members_team_kind ON team_members (team_id, kind);
CREATE INDEX idx_chat_channel_messages_author ON chat_channel_messages (author_member_id);

-- Grant to backend role
GRANT SELECT ON team_members TO roka_backend;
