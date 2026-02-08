-- ============================================================
-- Migration 002: Agent workflow + SMTP settings
-- Adds 'agent' to workflow_type enum and SMTP config rows.
-- ============================================================

-- Add 'agent' workflow type
ALTER TYPE workflow_type ADD VALUE IF NOT EXISTS 'agent';

-- SMTP settings for outbound email
INSERT INTO app_settings (key, value, is_secret) VALUES
    ('smtp_host', '', false),
    ('smtp_port', '587', false),
    ('smtp_user', '', false),
    ('smtp_password', '', true),
    ('smtp_from_email', '', false)
ON CONFLICT (key) DO NOTHING;

-- Allow authenticated users to read/write SMTP settings
-- (Extend existing RLS policy for app_settings)
DROP POLICY IF EXISTS app_settings_auth_update ON app_settings;
CREATE POLICY app_settings_auth_update ON app_settings FOR UPDATE
    USING (
        auth.role() = 'authenticated'
        AND key IN (
            'setup_complete', 'llm_provider', 'llm_model', 'llm_api_base', 'llm_api_key', 'llm_configured',
            'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email'
        )
    )
    WITH CHECK (
        key IN (
            'setup_complete', 'llm_provider', 'llm_model', 'llm_api_base', 'llm_api_key', 'llm_configured',
            'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email'
        )
        AND (
            (key IN ('llm_api_key', 'smtp_password') AND is_secret = true)
            OR (key NOT IN ('llm_api_key', 'smtp_password') AND is_secret = false)
        )
    );

DROP POLICY IF EXISTS app_settings_auth_insert ON app_settings;
CREATE POLICY app_settings_auth_insert ON app_settings FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND key IN (
            'setup_complete', 'llm_provider', 'llm_model', 'llm_api_base', 'llm_api_key', 'llm_configured',
            'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email'
        )
        AND (
            (key IN ('llm_api_key', 'smtp_password') AND is_secret = true)
            OR (key NOT IN ('llm_api_key', 'smtp_password') AND is_secret = false)
        )
    );
