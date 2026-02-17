-- ============================================================
-- Migration 006: Composite indexes for common list query patterns
-- Improves nodes sidebar, database rows, database views, agent tasks.
-- ============================================================

-- Nodes: owner + parent + type + updated_at (sidebar recent, root pages)
CREATE INDEX IF NOT EXISTS idx_nodes_owner_parent_type_updated
ON nodes (owner_id, parent_id, type, updated_at DESC);

-- Nodes: owner + parent + type + sort_order (database rows)
CREATE INDEX IF NOT EXISTS idx_nodes_owner_parent_type_sort
ON nodes (owner_id, parent_id, type, sort_order ASC);

-- Nodes: parent + sort_order for child row listing
CREATE INDEX IF NOT EXISTS idx_nodes_parent_sort
ON nodes (parent_id, sort_order ASC)
WHERE parent_id IS NOT NULL;

-- Database views: by database + sort order
CREATE INDEX IF NOT EXISTS idx_database_views_database_sort
ON database_views (database_id, sort_order ASC);

-- Agent tasks: owner + created_at for list
CREATE INDEX IF NOT EXISTS idx_agent_tasks_owner_created
ON agent_tasks (owner_id, created_at DESC);
