-- ============================================================
-- Migration 007: Platform tools
-- Adds 'platform' to tool_type enum for LangChain community
-- toolkit integrations. Tools are created via UI, not seeded.
-- ============================================================

ALTER TYPE tool_type ADD VALUE IF NOT EXISTS 'platform';

-- Clean up previously seeded system-level platform tools (now user-managed)
DELETE FROM tool_definitions
WHERE owner_id IS NULL AND type = 'platform';
