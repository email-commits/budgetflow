import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { syncAll } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/sync — force a fresh Plaid sync (DB mode only). */
export async function POST() {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "No database configured — sync happens per-request." }, { status: 400 });
  }
  const result = await syncAll(true);
  return NextResponse.json(result);
}
