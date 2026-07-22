import { NextRequest, NextResponse } from "next/server";
import { dbConfigured, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST /api/goals — create. Body: { name, kind, targetAmount?, targetDate?, accountId? } */
export async function POST(req: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: "Goals require a database (set DATABASE_URL)." }, { status: 400 });
  }
  try {
    const { name, kind, targetAmount, targetDate, accountId } = await req.json();
    if (!name || typeof name !== "string") return NextResponse.json({ error: "name required" }, { status: 400 });
    if (kind !== "save" && kind !== "payoff") return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    if (kind === "save" && (typeof targetAmount !== "number" || targetAmount <= 0)) {
      return NextResponse.json({ error: "targetAmount required for savings goals" }, { status: 400 });
    }
    if (kind === "payoff" && !accountId) {
      return NextResponse.json({ error: "payoff goals need a linked account" }, { status: 400 });
    }
    const db = getDb();
    let startAmount = 0;
    if (accountId) {
      const acct = await db.account.findUnique({ where: { id: accountId } });
      if (!acct) return NextResponse.json({ error: "account not found" }, { status: 400 });
      startAmount = acct.balance;
    }
    const goal = await db.goal.create({
      data: {
        name: name.trim(),
        kind,
        targetAmount: kind === "payoff" ? 0 : targetAmount,
        targetDate: targetDate || null,
        accountId: accountId || null,
        startAmount,
      },
    });
    return NextResponse.json({ ok: true, goal });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "create failed" }, { status: 500 });
  }
}

/** PATCH /api/goals — update. Body: { id, name?, targetAmount?, targetDate?, manualProgress? } */
export async function PATCH(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Requires a database." }, { status: 400 });
  try {
    const { id, name, targetAmount, targetDate, manualProgress } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (targetAmount !== undefined) data.targetAmount = Number(targetAmount);
    if (targetDate !== undefined) data.targetDate = targetDate || null;
    if (manualProgress !== undefined) data.manualProgress = Math.max(0, Number(manualProgress));
    const db = getDb();
    await db.goal.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "update failed" }, { status: 500 });
  }
}

/** DELETE /api/goals?id=... */
export async function DELETE(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Requires a database." }, { status: 400 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  await db.goal.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
