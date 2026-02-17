# Performance Baseline Checklist

Companion to `smoke_test.py` — capture before/after metrics when optimizing app snappiness.

## Prerequisites

- Stack running (`make up` or `docker compose up`)
- Authenticated session (logged-in user)
- Chrome DevTools or similar

## 1. Web Vitals (Frontend)

**Routes to measure:** `/workspace`, `/workspace/[slug]` (e.g. `/workspace/coucou-0d3798b5-6e61-4af4-9867-6d1da844bf3e`)

| Metric | Target | How to measure |
|--------|--------|----------------|
| TTFB   | < 200ms | Network tab: first request `TTFB` |
| FCP    | < 1.8s | Lighthouse or Performance > Timings |
| LCP    | < 2.5s | Lighthouse or Performance > Timings |
| INP    | < 200ms | Chrome DevTools > Performance Insights |
| JS transferred | Lower is better | Network tab: filter JS, sum transferred |
| Main-thread blocking | Lower is better | Performance > Bottom-up, sum Long Tasks |

**Quick path:** Lighthouse > Performance > run on `/workspace` and `/workspace/[slug]`.

## 2. API Latency (p95)

**Endpoints to measure:** `/api/nodes`, `/api/conversations`, `/api/database-definitions/[id]`, `/api/database-views`

```bash
# Example: 20 requests to nodes list (auth cookie required)
for i in {1..20}; do
  curl -s -o /dev/null -w "%{time_total}\n" \
    -H "Cookie: <session_cookie>" \
    "http://localhost:3000/api/nodes?type=page,database&parentId=null&limit=50"
done | sort -n
# p95 ≈ 19th value in sorted list
```

Or use browser Network tab: record 20+ requests, sort by Duration, take 95th percentile.

## 3. JS Bundle Weight

```bash
cd frontend && npm run build
# Check .next/build-manifest.json or .next/static/chunks/ for sizes
du -sh .next/static/chunks/*.js
# Or: ANALYZE=true npm run build (if bundle analyzer configured)
```

## 4. DB Query Plans

With `DATABASE_URL` from `infra/.env`:

```sql
-- Nodes list (sidebar / recent pages)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM nodes
WHERE owner_id = '<user_uuid>' AND parent_id IS NULL AND type IN ('page','database')
ORDER BY updated_at DESC LIMIT 50;

-- Database rows
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM nodes
WHERE owner_id = '<user_uuid>' AND parent_id = '<db_uuid>' AND type = 'database_row'
ORDER BY sort_order ASC LIMIT 100;

-- Agent tasks list
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM agent_tasks
WHERE owner_id = '<user_uuid>'
ORDER BY created_at DESC LIMIT 10;
```

Run in `psql` or pgAdmin. Check for "Seq Scan" vs "Index Scan"; high "Buffers" = more I/O.

## 5. Before/After Log

| Metric | Before | After | Date |
|--------|--------|-------|------|
| TTFB /workspace | | | |
| FCP /workspace | | | |
| LCP /workspace | | | |
| /api/nodes p95 (ms) | | | |
| /api/database-definitions p95 (ms) | | | |
| nodes list EXPLAIN cost | | | |
| Main JS chunk size (KB) | | | |
