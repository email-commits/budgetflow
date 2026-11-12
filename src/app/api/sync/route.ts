import { NextRequest, NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { recategorizeAll, syncAll } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/sync                — force a fresh Plaid sync (DB mode only).
 * POST /api/sync?recategorize=1 — re-apply the category mapping to transactions
 *                                 already stored (your own edits are kept).
 */
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "No database configured — sync happens per-request." }, { status: 400 });
  }
  if (req.nextUrl.searchParams.get("recategorize")) {
    return NextResponse.json(await recategorizeAll());
  }
  const result = await syncAll(true);
  return NextResponse.json(result);
}
