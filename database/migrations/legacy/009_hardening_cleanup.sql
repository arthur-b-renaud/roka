-- ============================================================
-- Migration 009: Hardening cleanup
-- 1) Ensure execution trace column exists for migrated DBs
-- 2) Remove unused s3_trace_key (feature not implemented)
-- 3) Remove legacy SMTP app settings keys
-- ============================================================

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS trace_log JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE agent_tasks
  DROP COLUMN IF EXISTS s3_trace_key;

DELETE FROM app_settings
WHERE key IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email');
