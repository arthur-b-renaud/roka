/**
 * Wraps a Drizzle transaction with PostgreSQL session variables for actor
 * attribution. The node_revisions trigger reads these to record who made
 * each change.
 *
 * SET LOCAL is transaction-scoped — values reset when the transaction
 * commits/rolls back, so they never leak to other requests sharing the
 * connection pool.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

type ActorTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withActor<T>(
  actorType: string,
  actorId: string,
  fn: (tx: ActorTx) => Promise<T>,
): Promise<T> {
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
