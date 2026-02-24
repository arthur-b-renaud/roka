-- Link agents to chat channels so they respond to messages.

CREATE TABLE IF NOT EXISTS chat_channel_agents (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id     UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    agent_definition_id UUID NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
    added_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(channel_id, agent_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_channel_agents_channel
    ON chat_channel_agents(channel_id);

-- Mark bot messages in chat_channel_messages.
ALTER TABLE chat_channel_messages
    ADD COLUMN IF NOT EXISTS agent_definition_id UUID
        REFERENCES agent_definitions(id) ON DELETE SET NULL;
