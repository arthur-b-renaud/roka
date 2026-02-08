import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public paths that don't need auth
  const isPublic =
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/app-settings");

  // Root redirect: check setup_complete via API (client-side handles this)
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/workspace", req.url));
  }

  // Protect workspace routes
  if (!isPublic && !req.auth) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
