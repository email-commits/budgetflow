import { NextRequest, NextResponse } from "next/server";
import { dbConfigured, getDb } from "@/lib/db";
import { decryptToken } from "@/lib/crypto";
import { getPlaidClient, plaidConfigured } from "@/lib/plaid";
import { recordSnapshot } from "@/lib/sync";

export const dynamic = "force-dynamic";

/** GET /api/banks — linked bank connections (DB mode only). */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ banks: [] });
  try {
    const db = getDb();
    const items = await db.plaidItem.findMany({ include: { _count: { select: { accounts: true } } } });
    return NextResponse.json({
      banks: items.map((i) => ({
        id: i.id,
        name: i.institutionName ?? "Bank",
        domain: i.institutionDomain,
        accounts: i._count.accounts,
        lastSyncedAt: i.lastSyncedAt,
      })),
    });
  } catch {
    return NextResponse.json({ banks: [] });
  }
}

/**
 * DELETE /api/banks?id=... — unlink a bank: revoke the token at Plaid (best
 * effort) and delete the item + its accounts/transactions/holdings (cascade).
 */
export async function DELETE(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Requires a database." }, { status: 400 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  const item = await db.plaidItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (plaidConfigured()) {
    try {
      await getPlaidClient().itemRemove({ access_token: decryptToken(item.accessToken) });
    } catch (e) {
      console.warn("Plaid itemRemove failed (continuing with local delete):", e);
    }
  }
  await db.plaidItem.delete({ where: { id } });
  await recordSnapshot(db).catch(() => {});
  return NextResponse.json({ ok: true });
}
