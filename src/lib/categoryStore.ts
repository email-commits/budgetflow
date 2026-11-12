import type { PrismaClient } from "@prisma/client";
import {
  CategoryDef,
  CategoryKind,
  DEFAULT_CATEGORIES,
  LEGACY_ALIASES,
  defaultGroupColor,
  registerCategories,
} from "./categories";

/**
 * Database side of the category list.
 *
 * The Category table is created and seeded here, on first use, instead of by a
 * separate migration step — the app is deployed straight from git with no
 * migration run, so a new table has to bring itself into existence. The DDL
 * matches what `prisma db push` generates for the model in schema.prisma, so
 * running db push later is a no-op.
 */

let ensured = false;

export async function ensureCategories(db: PrismaClient): Promise<void> {
  if (ensured) return;
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Category" (
      "name" TEXT NOT NULL,
      "group" TEXT NOT NULL,
      "color" TEXT NOT NULL,
      "kind" TEXT NOT NULL DEFAULT 'expense',
      "excluded" BOOLEAN NOT NULL DEFAULT false,
      "hidden" BOOLEAN NOT NULL DEFAULT false,
      "custom" BOOLEAN NOT NULL DEFAULT false,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "Category_pkey" PRIMARY KEY ("name")
    )`);

  if ((await db.category.count()) === 0) {
    await db.category.createMany({ data: DEFAULT_CATEGORIES, skipDuplicates: true });
    await migrateLegacyNames(db);
  }
  ensured = true;
}

/**
 * One-time move from the original 14 category names to the new list, for the
 * things YOU set: budgets, rules and manual per-transaction edits. (Plaid's own
 * category on each transaction is translated at read time and filed precisely
 * by Settings -> Re-apply categories.)
 */
async function migrateLegacyNames(db: PrismaClient): Promise<void> {
  for (const [from, to] of Object.entries(LEGACY_ALIASES)) {
    if (from === to) continue;
    await db.transaction.updateMany({ where: { categoryOverride: from }, data: { categoryOverride: to } });
    await db.rule.updateMany({ where: { setCategory: from }, data: { setCategory: to } });
    const old = await db.budget.findUnique({ where: { category: from } });
    if (old) {
      const clash = await db.budget.findUnique({ where: { category: to } });
      if (clash) {
        await db.budget.update({ where: { category: to }, data: { monthlyLimit: clash.monthlyLimit + old.monthlyLimit } });
        await db.budget.delete({ where: { category: from } });
      } else {
        await db.budget.update({ where: { category: from }, data: { category: to } });
      }
    }
  }
  // "Other" was never budgetable in a meaningful way, but keep any row consistent
}

function toDef(r: {
  name: string;
  group: string;
  color: string;
  kind: string;
  excluded: boolean;
  hidden: boolean;
  custom: boolean;
  sortOrder: number;
}): CategoryDef {
  const kind: CategoryKind = r.kind === "income" || r.kind === "transfer" ? r.kind : "expense";
  return { ...r, kind, excluded: r.excluded || kind === "transfer" };
}

/** Load the list from the database and make it the active registry. */
export async function loadCategories(db: PrismaClient): Promise<CategoryDef[]> {
  await ensureCategories(db);
  const rows = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const defs = rows.map(toDef);
  registerCategories(defs);
  return defs;
}

export async function createCategory(
  db: PrismaClient,
  input: { name: string; group: string; color?: string; kind?: CategoryKind; excluded?: boolean }
): Promise<CategoryDef> {
  const existing = await loadCategories(db);
  if (existing.some((c) => c.name.toLowerCase() === input.name.toLowerCase())) {
    throw new Error(`A category named "${input.name}" already exists.`);
  }
  // place it at the end of its group (or after everything, for a new group)
  const inGroup = existing.filter((c) => c.group === input.group);
  const sortOrder = inGroup.length
    ? Math.max(...inGroup.map((c) => c.sortOrder)) + 1
    : Math.floor(Math.max(0, ...existing.filter((c) => c.group !== "Other" && c.group !== "Transfers").map((c) => c.sortOrder)) / 100) * 100 + 100;
  const kind = input.kind ?? inGroup[0]?.kind ?? "expense";
  const row = await db.category.create({
    data: {
      name: input.name,
      group: input.group,
      color: input.color ?? inGroup[0]?.color ?? defaultGroupColor(input.group),
      kind,
      excluded: Boolean(input.excluded) || kind === "transfer",
      custom: true,
      sortOrder,
    },
  });
  await loadCategories(db);
  return toDef(row);
}

export async function updateCategory(
  db: PrismaClient,
  name: string,
  changes: { rename?: string; color?: string; excluded?: boolean; hidden?: boolean; group?: string }
): Promise<void> {
  const existing = await loadCategories(db);
  const cat = existing.find((c) => c.name === name);
  if (!cat) throw new Error("Category not found.");

  const data: Record<string, unknown> = {};
  if (changes.color !== undefined) data.color = changes.color;
  if (changes.hidden !== undefined) {
    if (name === "Uncategorized" && changes.hidden) throw new Error("Uncategorized can't be hidden.");
    data.hidden = changes.hidden;
  }
  if (changes.excluded !== undefined && cat.kind !== "transfer") data.excluded = changes.excluded;
  if (changes.group !== undefined && cat.custom) data.group = changes.group;

  if (changes.rename !== undefined && changes.rename !== name) {
    if (!cat.custom) throw new Error("Built-in categories can't be renamed — hide it and add your own instead.");
    if (existing.some((c) => c.name.toLowerCase() === changes.rename!.toLowerCase())) {
      throw new Error(`A category named "${changes.rename}" already exists.`);
    }
    // name is the key everything refers to: move the references along with it
    await db.$transaction([
      db.category.update({ where: { name }, data: { ...data, name: changes.rename } }),
      db.transaction.updateMany({ where: { categoryOverride: name }, data: { categoryOverride: changes.rename } }),
      db.rule.updateMany({ where: { setCategory: name }, data: { setCategory: changes.rename } }),
      db.budget.updateMany({ where: { category: name }, data: { category: changes.rename } }),
    ]);
  } else if (Object.keys(data).length > 0) {
    await db.category.update({ where: { name }, data });
  }
  await loadCategories(db);
}

/** Delete a custom category. Transactions fall back to their original category; its rules and budget go too. */
export async function deleteCategory(db: PrismaClient, name: string): Promise<void> {
  const cat = await db.category.findUnique({ where: { name } });
  if (!cat) return;
  if (!cat.custom) throw new Error("Built-in categories can't be deleted — hide it instead.");
  await db.$transaction([
    db.transaction.updateMany({ where: { categoryOverride: name }, data: { categoryOverride: null } }),
    db.rule.deleteMany({ where: { setCategory: name, renameTo: null } }),
    db.rule.updateMany({ where: { setCategory: name }, data: { setCategory: null } }),
    db.budget.deleteMany({ where: { category: name } }),
    db.category.delete({ where: { name } }),
  ]);
  await loadCategories(db);
}
