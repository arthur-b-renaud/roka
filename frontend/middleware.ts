import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/app-settings");

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/workspace", req.url));
  }

  if (!isPublic && !req.auth) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  return response;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
