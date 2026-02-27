/**
 * Worker-specific database connections.
 * Separate from frontend/lib/db/index.ts — the worker runs as its own process
 * and needs its own connection pool + a dedicated LISTEN connection.
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

const DATABASE_URL = process.env.DATABASE_URL!;
const POOL_MAX = parseInt(process.env.WORKER_DB_POOL_MAX || "5", 10);

let queryClient: ReturnType<typeof postgres> | null = null;
let listenClient: ReturnType<typeof postgres> | null = null;
let drizzleDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getQueryClient() {
  if (!queryClient) {
    queryClient = postgres(DATABASE_URL, { max: POOL_MAX });
  }
  return queryClient;
}

export function getDb() {
  if (!drizzleDb) {
    drizzleDb = drizzle(getQueryClient(), { schema });
  }
  return drizzleDb;
}

export function getListenClient() {
  if (!listenClient) {
    listenClient = postgres(DATABASE_URL, { max: 1 });
  }
  return listenClient;
}

export async function closeAll() {
  if (listenClient) {
    await listenClient.end();
    listenClient = null;
  }
  if (queryClient) {
    await queryClient.end();
    queryClient = null;
    drizzleDb = null;
  }
}
