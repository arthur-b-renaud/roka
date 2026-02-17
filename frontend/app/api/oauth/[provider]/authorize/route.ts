import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const PROVIDER_CONFIG: Record<
  string,
  { authUrl: string; clientIdEnv: string; scopes: string[] }
> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    scopes: ["https://mail.google.com/"],
  },
  slack: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    clientIdEnv: "SLACK_OAUTH_CLIENT_ID",
    scopes: ["chat:write", "channels:read", "users:read"],
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
  const { provider } = await params;
  const config = PROVIDER_CONFIG[provider?.toLowerCase() ?? ""];
  if (!config) {
    return NextResponse.redirect(
      new URL("/workspace/settings?oauth=error&reason=unknown_provider", request.url)
    );
  }
  const clientId = process.env[config.clientIdEnv];
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/workspace/settings?oauth=error&reason=not_configured", request.url)
    );
  }
  const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/oauth/${provider}/callback`;
  const state = Buffer.from(
    JSON.stringify({ userId: session.user.id, ts: Date.now() })
  ).toString("base64url");
  const scopeStr =
    provider === "google"
      ? config.scopes.join(" ")
      : config.scopes.join(",");
  const paramsObj: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopeStr,
    state,
  };
  const url = new URL(config.authUrl);
  Object.entries(paramsObj).forEach(([k, v]) => url.searchParams.set(k, v));
  return NextResponse.redirect(url.toString());
}
