/**
 * Strict API handler factory — enforces auth + validation on every route.
 * Every handler gets a userId and optionally parsed body data.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

type HandlerFn<T> = (
  data: T,
  userId: string,
  req: Request,
) => Promise<unknown>;

interface HandlerOptions<T> {
  schema?: ZodSchema<T>;
  public?: boolean; // skip auth check
}

/** Authenticated GET handler (no body parsing). */
export function GET(handler: (userId: string, req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      const result = await handler(session.user.id, req);
      return NextResponse.json(result ?? { ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Internal server error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  };
}

/** Authenticated mutation handler (POST/PATCH/DELETE) with optional Zod body validation. */
export function mutation<T = void>(
  handler: HandlerFn<T>,
  opts?: HandlerOptions<T>,
) {
  return async (req: Request) => {
    if (!opts?.public) {
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
        const result = await handler(parsedData, userId, req);
        return NextResponse.json(result ?? { ok: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal server error";
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    // Public route (no auth)
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
      const result = await handler(parsedData, "", req);
      return NextResponse.json(result ?? { ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Internal server error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  };
}

/** Public GET handler (no auth). */
export function publicGET(handler: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      const result = await handler(req);
      return NextResponse.json(result ?? { ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Internal server error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  };
}
