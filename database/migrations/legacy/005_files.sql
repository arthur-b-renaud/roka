-- ============================================================
-- Migration 005: Files table (object storage metadata)
-- ============================================================

CREATE TABLE IF NOT EXISTS files (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    node_id     UUID REFERENCES nodes(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
    size_bytes  BIGINT NOT NULL DEFAULT 0,
    s3_key      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_owner ON files (owner_id);
CREATE INDEX IF NOT EXISTS idx_files_node ON files (node_id);

GRANT SELECT ON files TO roka_backend;
