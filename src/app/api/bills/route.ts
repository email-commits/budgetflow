import { NextRequest, NextResponse } from "next/server";
import { dbConfigured, getDb } from "@/lib/db";
import { getAppData } from "@/lib/data";
import { detectRecurring } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** GET /api/bills — list bills. */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ bills: [] });
  const db = getDb();
  const bills = await db.bill.findMany({ orderBy: { dueDay: "asc" } });
  return NextResponse.json({ bills });
}

/** POST /api/bills — create, or {importRecurring: true} to seed from detected recurring charges. */
export async function POST(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Requires a database." }, { status: 400 });
  try {
    const body = await req.json();
    const db = getDb();

    if (body.importRecurring) {
      const data = await getAppData();
      const recurring = detectRecurring(data.transactions).filter((r) => r.cadence === "monthly");
      const existing = await db.bill.findMany();
      let created = 0;
      for (const r of recurring) {
        if (existing.some((b) => r.merchant.toLowerCase().includes(b.match.toLowerCase()))) continue;
        await db.bill.create({
          data: {
            name: r.merchant,
            match: r.merchant,
            expectedAmount: r.averageAmount,
            dueDay: Math.min(28, new Date(r.nextDate + "T12:00:00").getDate()),
          },
        });
        created++;
      }
      return NextResponse.json({ ok: true, created });
    }

    const { name, match, expectedAmount, dueDay, tolerance } = body;
    if (!name || !match || typeof expectedAmount !== "number" || expectedAmount <= 0) {
      return NextResponse.json({ error: "name, match, expectedAmount required" }, { status: 400 });
    }
    if (typeof dueDay !== "number" || dueDay < 1 || dueDay > 31) {
      return NextResponse.json({ error: "dueDay must be 1-31" }, { status: 400 });
    }
    const bill = await db.bill.create({
      data: {
        name: String(name).trim(),
        match: String(match).trim(),
        expectedAmount,
        dueDay,
        tolerance: typeof tolerance === "number" && tolerance >= 0 && tolerance <= 1 ? tolerance : 0.1,
      },
    });
    return NextResponse.json({ ok: true, bill });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "create failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/bills — update.
 * Body: { id, name?, match?, expectedAmount?, dueDay?, tolerance?, active?,
 *         statementAmount?, statementDate?, planInfo? }
 * Statement fields hold what the biller's own site says is due this cycle
 * (pass null to clear). When present, bill status verifies exactly against them.
 */
export async function PATCH(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Requires a database." }, { status: 400 });
  try {
    const { id, name, match, expectedAmount, dueDay, tolerance, active, statementAmount, statementDate, planInfo } =
      await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (match !== undefined) data.match = String(match).trim();
    if (expectedAmount !== undefined) data.expectedAmount = Number(expectedAmount);
    if (dueDay !== undefined) data.dueDay = Math.max(1, Math.min(31, Number(dueDay)));
    if (tolerance !== undefined) data.tolerance = Math.max(0, Math.min(1, Number(tolerance)));
    if (active !== undefined) data.active = Boolean(active);
    if (statementAmount !== undefined) data.statementAmount = statementAmount === null ? null : Number(statementAmount);
    if (statementDate !== undefined) data.statementDate = statementDate || null;
    if (planInfo !== undefined) data.planInfo = planInfo ? String(planInfo).slice(0, 2000) : null;
    const db = getDb();
    await db.bill.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "update failed" }, { status: 500 });
  }
}

/** DELETE /api/bills?id=... */
export async function DELETE(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ error: "Requires a database." }, { status: 400 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  await db.bill.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
