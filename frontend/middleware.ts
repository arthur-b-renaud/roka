import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  // Check setup_complete for root path
  if (request.nextUrl.pathname === "/") {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
          },
        },
      }
    );

    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "setup_complete")
      .single();

    const isSetupComplete = data?.value === "true";
    
    if (isSetupComplete) {
      return NextResponse.redirect(new URL("/workspace", request.url));
    } else {
      return NextResponse.redirect(new URL("/setup", request.url));
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
