import { NextRequest, NextResponse } from "next/server";
import { cleanCategoryName, CategoryKind } from "@/lib/categories";
import { createCategory, deleteCategory, loadCategories, updateCategory } from "@/lib/categoryStore";
import { dbConfigured, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const noDb = () => NextResponse.json({ error: "Categories require a database (set DATABASE_URL)." }, { status: 400 });
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const COLOR = /^#[0-9a-fA-F]{6}$/;
const KINDS: CategoryKind[] = ["expense", "income", "transfer"];

/** GET /api/categories — the full list (defaults + custom, including hidden). */
export async function GET() {
  if (!dbConfigured()) return noDb();
  return NextResponse.json({ categories: await loadCategories(getDb()) });
}

/** POST /api/categories — add your own. Body: { name, group, color?, kind?, excluded? } */
export async function POST(req: NextRequest) {
  if (!dbConfigured()) return noDb();
  try {
    const body = await req.json();
    const name = cleanCategoryName(body.name);
    const group = cleanCategoryName(body.group);
    if (!name) return bad("Name must be 2–40 characters.");
    if (!group) return bad("Group must be 2–40 characters.");
    if (body.color !== undefined && !COLOR.test(body.color)) return bad("Color must look like #3987e5.");
    if (body.kind !== undefined && !KINDS.includes(body.kind)) return bad("Unknown kind.");
    const category = await createCategory(getDb(), {
      name,
      group,
      color: body.color,
      kind: body.kind,
      excluded: Boolean(body.excluded),
    });
    return NextResponse.json({ ok: true, category });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "create failed");
  }
}

/**
 * PATCH /api/categories — change one. Body: { name, rename?, color?, excluded?, hidden?, group? }
 * Built-in categories can be recoloured, hidden or excluded; only your own can be renamed or regrouped.
 */
export async function PATCH(req: NextRequest) {
  if (!dbConfigured()) return noDb();
  try {
    const body = await req.json();
    if (typeof body.name !== "string") return bad("name required");
    const changes: Parameters<typeof updateCategory>[2] = {};
    if (body.rename !== undefined) {
      const rename = cleanCategoryName(body.rename);
      if (!rename) return bad("Name must be 2–40 characters.");
      changes.rename = rename;
    }
    if (body.group !== undefined) {
      const group = cleanCategoryName(body.group);
      if (!group) return bad("Group must be 2–40 characters.");
      changes.group = group;
    }
    if (body.color !== undefined) {
      if (!COLOR.test(body.color)) return bad("Color must look like #3987e5.");
      changes.color = body.color;
    }
    if (body.excluded !== undefined) changes.excluded = Boolean(body.excluded);
    if (body.hidden !== undefined) changes.hidden = Boolean(body.hidden);
    await updateCategory(getDb(), body.name, changes);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "update failed");
  }
}

/** DELETE /api/categories?name=... — remove one of your own categories. */
export async function DELETE(req: NextRequest) {
  if (!dbConfigured()) return noDb();
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return bad("name required");
  try {
    await deleteCategory(getDb(), name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "delete failed");
  }
}
