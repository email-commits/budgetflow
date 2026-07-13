import { NextRequest, NextResponse } from "next/server";

/**
 * Simple password gate for the deployed app.
 * Set APP_PASSWORD in your environment to enable it (username is ignored —
 * enter anything). Leave APP_PASSWORD unset for open access (local dev).
 * /api/digest is excluded: it authenticates with CRON_SECRET instead.
 */
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/digest")) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [, pass] = atob(header.slice(6)).split(":");
      if (pass === password) return NextResponse.next();
    } catch {
      /* fall through */
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="BudgetFlow"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
