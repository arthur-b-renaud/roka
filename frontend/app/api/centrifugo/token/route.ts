/**
 * Centrifugo connection JWT — auth-gated, returns token for WebSocket auth.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import * as jose from "jose";

const TOKEN_TTL_SEC = 12 * 60 * 60; // 12h

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.CENTRIFUGO_TOKEN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Centrifugo not configured" }, { status: 500 });
  }

  const token = await new jose.SignJWT({ sub: session.user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC)
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ token });
}
