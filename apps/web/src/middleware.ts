import { NextRequest, NextResponse } from "next/server";
import { requireAppAccess } from "./lib/app-access";

export async function middleware(request: NextRequest) {
  // Only these cron handlers bypass interactive access; each checks CRON_SECRET itself.
  const path = request.nextUrl.pathname;
  const cron = path === "/api/cron/catalog-sync" || /^\/api\/cron\/catalog-source\/[^/]+$/.test(path);
  if (!cron) {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
