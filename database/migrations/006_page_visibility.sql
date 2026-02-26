-- Page visibility: private (default), team, shared (link), published (public)
CREATE TYPE page_visibility AS ENUM ('private', 'team', 'shared', 'published');

ALTER TABLE nodes
  ADD COLUMN visibility page_visibility NOT NULL DEFAULT 'private',
  ADD COLUMN share_token TEXT UNIQUE,
  ADD COLUMN published_slug TEXT UNIQUE,
  ADD COLUMN published_at TIMESTAMPTZ;

CREATE INDEX idx_nodes_share_token ON nodes(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_nodes_published_slug ON nodes(published_slug) WHERE published_slug IS NOT NULL;
CREATE INDEX idx_nodes_visibility ON nodes(visibility) WHERE visibility != 'private';
