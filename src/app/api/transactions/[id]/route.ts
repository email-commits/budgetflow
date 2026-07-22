import { NextRequest, NextResponse } from "next/server";
import { dbConfigured, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/transactions/:id — set user overrides.
 * Body: { category?: string | null, merchant?: string | null, hidden?: boolean }
 * Passing null for category/merchant clears the override (reverts to rule/Plaid value).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Editing requires a database (set DATABASE_URL)." }, { status: 400 });
  }
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if ("category" in body) data.categoryOverride = body.category ?? null;
    if ("merchant" in body) data.merchantOverride = body.merchant === "" ? null : (body.merchant ?? null);
    if ("hidden" in body) data.hidden = Boolean(body.hidden);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const db = getDb();
    await db.transaction.update({ where: { id: params.id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
