import { NextRequest, NextResponse } from "next/server";

/**
 * Simple password gate for the deployed app.
 * Set APP_PASSWORD in your environment to enable it (username is ignored —
 * enter anything). Leave APP_PASSWORD unset for open access (local dev).
 * /api/digest and /api/backup are excluded: Vercel Cron calls them with
 * CRON_SECRET instead (the backup route refuses to run without it).
 */
export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/digest") || path === "/api/backup") return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      // "user:password" — the password is everything after the FIRST colon,
      // so passwords that themselves contain ":" still work.
      const decoded = atob(header.slice(6));
      const pass = decoded.slice(decoded.indexOf(":") + 1);
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
