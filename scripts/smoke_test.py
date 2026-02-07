#!/usr/bin/env python3
"""
Smoke test: verifies the full agent pipeline works end-to-end.

  1. Creates a test node in the DB.
  2. Inserts a 'summarize' agent_task.
  3. Polls until status changes from 'pending'.
  4. Verifies completion (or reports failure reason).
  5. Cleans up test data.

Usage:
  # With the stack running (make up):
  DATABASE_URL=postgresql://postgres:<password>@localhost:5432/postgres python scripts/smoke_test.py

  # Or read from infra/.env:
  source <(grep DATABASE_URL infra/.env) && python scripts/smoke_test.py
"""

import asyncio
import json
import os
import sys
import time
import uuid

try:
    import asyncpg
except ImportError:
    print("ERROR: asyncpg not installed. Run: pip install asyncpg")
    sys.exit(1)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/postgres",
)

TIMEOUT_SECONDS = 60
POLL_INTERVAL = 2

# Fake owner_id (won't match any real user, but backend uses service_role so RLS is bypassed)
OWNER_ID = uuid.uuid4()


async def main() -> int:
    print(f"Connecting to: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")
    conn = await asyncpg.connect(DATABASE_URL)

    node_id = None
    task_id = None

    try:
        # Step 1: Create a test node
        node_id = await conn.fetchval("""
            INSERT INTO nodes (owner_id, type, title, content, search_text)
            VALUES ($1, 'page', 'Smoke Test Page', '[]'::jsonb, 'This is a smoke test page with some content for summarization.')
            RETURNING id
        """, OWNER_ID)
        print(f"  Created test node: {node_id}")

        # Step 2: Insert agent_task
        task_id = await conn.fetchval("""
            INSERT INTO agent_tasks (owner_id, workflow, node_id, input, status)
            VALUES ($1, 'summarize', $2, $3::jsonb, 'pending')
            RETURNING id
        """, OWNER_ID, node_id, json.dumps({"node_id": str(node_id)}))
        print(f"  Created agent_task: {task_id}")

        # Step 3: Poll for completion
        start = time.monotonic()
        final_status = "pending"
        while (time.monotonic() - start) < TIMEOUT_SECONDS:
            row = await conn.fetchrow(
                "SELECT status, output, error FROM agent_tasks WHERE id = $1",
                task_id,
            )
            if row is None:
                print("  ERROR: Task row disappeared!")
                return 1

            final_status = row["status"]
            if final_status in ("completed", "failed", "cancelled"):
                break

            elapsed = int(time.monotonic() - start)
            print(f"  [{elapsed}s] Status: {final_status}...")
            await asyncio.sleep(POLL_INTERVAL)

        elapsed = round(time.monotonic() - start, 1)

        # Step 4: Report
        if final_status == "completed":
            output = row["output"]
            print(f"\n  PASS: Task completed in {elapsed}s")
            print(f"  Output: {json.dumps(dict(output) if output else {}, indent=2)}")
            return 0
        elif final_status == "failed":
            print(f"\n  FAIL: Task failed after {elapsed}s")
            print(f"  Error: {row['error']}")
            return 1
        else:
            print(f"\n  TIMEOUT: Task still '{final_status}' after {TIMEOUT_SECONDS}s")
            print("  Is the backend running? Check: docker compose logs backend")
            return 1

    finally:
        # Step 5: Cleanup
        if task_id:
            await conn.execute("DELETE FROM agent_tasks WHERE id = $1", task_id)
        if node_id:
            await conn.execute("DELETE FROM nodes WHERE id = $1", node_id)
        print("  Cleaned up test data.")
        await conn.close()


if __name__ == "__main__":
    print("\nRoka Smoke Test")
    print("=" * 40)
    code = asyncio.run(main())
    print()
    sys.exit(code)
