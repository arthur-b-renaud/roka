/**
 * Drizzle ORM client — server-side only.
 * Uses postgres.js driver for direct PostgreSQL access.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// Single shared connection for queries (max 10 concurrent)
const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

// Separate connection factory for LISTEN/NOTIFY (SSE needs its own)
export function createListenConnection() {
  return postgres(connectionString, { max: 1 });
}
