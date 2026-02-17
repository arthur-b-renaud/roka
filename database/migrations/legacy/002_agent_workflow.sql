-- Migration 002: Agent workflow + SMTP settings
-- Adds 'agent' to workflow_type enum and SMTP config rows.

ALTER TYPE workflow_type ADD VALUE IF NOT EXISTS 'agent';

INSERT INTO app_settings (key, value, is_secret) VALUES
    ('smtp_host', '', false),
    ('smtp_port', '587', false),
    ('smtp_user', '', false),
    ('smtp_password', '', true),
    ('smtp_from_email', '', false)
ON CONFLICT (key) DO NOTHING;
