import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
  const { provider } = await params;
  if (!provider || !["google", "slack"].includes(provider.toLowerCase())) {
    return NextResponse.redirect(
      new URL("/workspace/settings?oauth=error&reason=invalid_provider", request.url)
    );
  }
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      new URL(`/workspace/settings?oauth=error&reason=${encodeURIComponent(error)}`, request.url)
    );
  }
  if (!code) {
    return NextResponse.redirect(
      new URL("/workspace/settings?oauth=error&reason=no_code", request.url)
    );
  }
  const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/oauth/${provider}/callback`;
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8100";
  const res = await fetch(`${backendUrl}/api/oauth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: provider.toLowerCase(),
      code,
      redirect_uri: redirectUri,
      user_id: session.user.id,
      state,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data.detail || res.statusText;
    return NextResponse.redirect(
      new URL(`/workspace/settings?oauth=error&reason=${encodeURIComponent(msg)}`, request.url)
    );
  }
  return NextResponse.redirect(
    new URL(`/workspace/settings?oauth=success&provider=${provider}`, request.url)
  );
}
