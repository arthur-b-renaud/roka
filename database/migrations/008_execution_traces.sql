-- ============================================================
-- Migration 008: Execution traces
-- Adds trace_log JSONB to agent_tasks for structured step-by-step
-- execution audit, and s3_trace_key for large trace offload.
-- ============================================================

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS trace_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS s3_trace_key TEXT;

-- trace_log schema:
-- [
--   { "step": 1, "type": "thinking", "content": "...", "ts": "ISO8601" },
--   { "step": 2, "type": "tool_call", "tool": "search_knowledge_base", "input": {...}, "ts": "..." },
--   { "step": 3, "type": "tool_result", "tool": "search_knowledge_base", "output": "...", "duration_ms": 120, "ts": "..." },
--   { "step": 4, "type": "response", "content": "...", "ts": "..." }
-- ]

CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_created
  ON agent_tasks (status, created_at DESC);

COMMENT ON COLUMN agent_tasks.trace_log IS 'Structured step-by-step execution trace (tool calls, thinking, results)';
COMMENT ON COLUMN agent_tasks.s3_trace_key IS 'S3 key for full trace dump when trace_log exceeds inline limit';
