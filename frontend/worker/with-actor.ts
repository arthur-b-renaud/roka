/**
 * Worker-specific withActor — same semantics as lib/db/with-actor.ts
 * but uses the worker's DB pool instead of the frontend's.
 */

import { sql } from "drizzle-orm";
import { getDb } from "./db";

type WorkerTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export async function withActor<T>(
  actorType: string,
  actorId: string,
  fn: (tx: WorkerTx) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('roka.actor_type', ${actorType}, true)`,
    );
    await tx.execute(
      sql`SELECT set_config('roka.actor_id', ${actorId}, true)`,
    );
    return fn(tx);
  });
}
