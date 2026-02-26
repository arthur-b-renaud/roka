/**
 * Strict API handler factory — enforces auth + Zod validation on every route.
 * Wraps Next.js App Router handlers to inject userId, parse body, pass route params.
 * Optionally resolves team_members permissions for the caller.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z, type ZodSchema } from "zod";
import { db } from "@/lib/db";
import { teamMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Reusable Zod schema for route params containing a single UUID `id`. */
export const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid id"),
});

/** Parse `limit` and optional `cursor` from a request URL's search params. */
export function parsePagination(
  req: Request,
  defaults: { limit?: number; maxLimit?: number } = {},
): { limit: number; cursor: string | null } {
  const url = new URL(req.url);
  const { limit: defaultLimit = 50, maxLimit = 200 } = defaults;
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? String(defaultLimit), 10) || defaultLimit,
    maxLimit,
  );
  const cursor = url.searchParams.get("cursor");
  return { limit, cursor };
}

export type RouteContext = { params: Record<string, string> };

export type MemberPermissions = {
  memberId: string;
  kind: "human" | "ai";
  pageAccess: "all" | "selected";
  allowedNodeIds: string[];
  canWrite: boolean;
};

type GetHandlerFn = (
  userId: string,
  req: Request,
  ctx: RouteContext,
) => Promise<unknown>;

type MutationHandlerFn<T> = (
  data: T,
  userId: string,
  req: Request,
  ctx: RouteContext,
) => Promise<unknown>;

interface MutationOptions<T> {
  schema?: ZodSchema<T>;
}

function errorResponse(e: unknown): NextResponse {
  console.error("API error:", e);
  if (e instanceof Error) {
    if (e.message === "Forbidden" || e.message.startsWith("Cannot ")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    if (e.message.startsWith("Invalid ")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e.message.includes("not found")) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    if (e.message.includes("already")) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/**
 * Resolve the calling user's team_members permissions.
 * Returns null if the user has no membership yet (bootstrap will create one).
 */
export async function getMemberPermissions(userId: string): Promise<MemberPermissions | null> {
  const [row] = await db
    .select({
      id: teamMembers.id,
      kind: teamMembers.kind,
      pageAccess: teamMembers.pageAccess,
      allowedNodeIds: teamMembers.allowedNodeIds,
      canWrite: teamMembers.canWrite,
    })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);

  if (!row) return null;

  return {
    memberId: row.id,
    kind: row.kind,
    pageAccess: row.pageAccess,
    allowedNodeIds: (row.allowedNodeIds ?? []) as string[],
    canWrite: row.canWrite,
  };
}

/** Authenticated GET handler. */
export function GET(handler: GetHandlerFn) {
  return async (req: Request, ctx: RouteContext = { params: {} }) => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      const result = await handler(session.user.id, req, ctx);
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Authenticated mutation handler (POST/PATCH/DELETE) with optional Zod body validation. */
export function mutation<T = void>(
  handler: MutationHandlerFn<T>,
  opts?: MutationOptions<T>,
) {
  return async (req: Request, ctx: RouteContext = { params: {} }) => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    let parsedData = {} as T;
    if (opts?.schema) {
      try {
        const body = await req.json();
        const result = opts.schema.safeParse(body);
        if (!result.success) {
          return NextResponse.json(
            { error: result.error.issues[0].message },
            { status: 400 },
          );
        }
        parsedData = result.data;
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
    }

    try {
      const result = await handler(parsedData, userId, req, ctx);
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Public GET handler (no auth required). */
export function publicGET(handler: (req: Request, ctx: RouteContext) => Promise<unknown>) {
  return async (req: Request, ctx: RouteContext = { params: {} }) => {
    try {
      const result = await handler(req, ctx);
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
