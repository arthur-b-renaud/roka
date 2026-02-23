/**
 * Strict API handler factory — enforces auth + Zod validation on every route.
 * Wraps Next.js App Router handlers to inject userId, parse body, pass route params.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

export type RouteContext = { params: Record<string, string> };

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
    if (e.message.startsWith("Invalid ")) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e.message.includes("not found")) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
export function publicGET(handler: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      const result = await handler(req);
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
