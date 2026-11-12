/**
 * Category system.
 *
 * Categories are data, not code: a Monarch-style default list (grouped) that
 * you can extend with your own. Every category has a group (for display), a
 * colour, a kind, and two switches:
 *   - excluded: left out of spending, income, budgets and reviews (transfers
 *     always are; you can also exclude any category of your own)
 *   - hidden:   not offered in pickers (existing transactions keep it)
 *
 * This module has no server-only imports so pages and API routes can share it.
 * The current list lives in a small in-memory registry that is refreshed from
 * the database on every data load (server) and from the loaded data (browser).
 */

export type CategoryKind = "expense" | "income" | "transfer";

export interface CategoryDef {
  name: string;
  group: string;
  color: string;
  kind: CategoryKind;
  /** left out of spending / income / budgets (always true for transfers) */
  excluded: boolean;
  /** not offered in pickers */
  hidden: boolean;
  /** created by you (can be renamed and deleted; defaults can only be hidden) */
  custom: boolean;
  sortOrder: number;
}

export const UNCATEGORIZED = "Uncategorized";

const GROUP_COLORS: Record<string, string> = {
  Income: "#008300",
  Housing: "#d95926",
  "Bills & Utilities": "#e66767",
  "Food & Dining": "#199e70",
  "Auto & Transport": "#9085e9",
  Shopping: "#3987e5",
  "Travel & Lifestyle": "#1baf7a",
  Children: "#e0a03a",
  Education: "#5c9bd6",
  "Health & Wellness": "#0ca30c",
  "Gifts & Donations": "#c264c9",
  Financial: "#b8405e",
  Transfers: "#6b7280",
  Other: "#898781",
};

/** [group, kind, names] — order here is the display order. */
const DEFAULT_LAYOUT: [string, CategoryKind, string[]][] = [
  ["Income", "income", ["Paychecks", "Interest", "Business Income", "Other Income"]],
  ["Housing", "expense", ["Mortgage", "Rent", "Home Improvement"]],
  [
    "Bills & Utilities",
    "expense",
    ["Gas & Electric", "Water & Garbage", "Internet & Cable", "Phone", "Subscriptions", "Other Utilities"],
  ],
  ["Food & Dining", "expense", ["Groceries", "Restaurants & Bars", "Coffee Shops"]],
  [
    "Auto & Transport",
    "expense",
    ["Gas", "Auto Payment", "Auto Maintenance", "Parking & Tolls", "Public Transit", "Taxi & Ride Shares", "Other Transport"],
  ],
  ["Shopping", "expense", ["Shopping", "Clothing", "Electronics", "Furniture & Housewares"]],
  ["Travel & Lifestyle", "expense", ["Travel & Vacation", "Entertainment & Recreation", "Personal Care", "Pets"]],
  ["Children", "expense", ["Child Care", "Child Activities"]],
  ["Education", "expense", ["Education", "Student Loans"]],
  ["Health & Wellness", "expense", ["Medical", "Dentist", "Fitness"]],
  ["Gifts & Donations", "expense", ["Gifts", "Charity"]],
  [
    "Financial",
    "expense",
    ["Loan Repayment", "Insurance", "Taxes", "Financial Fees", "Cash & ATM", "Financial & Legal Services"],
  ],
  ["Transfers", "transfer", ["Transfer", "Credit Card Payment"]],
  ["Other", "expense", [UNCATEGORIZED, "Miscellaneous"]],
];

export const DEFAULT_CATEGORIES: CategoryDef[] = DEFAULT_LAYOUT.flatMap(([group, kind, names], g) =>
  names.map(
    (name, i): CategoryDef => ({
      name,
      group,
      color: GROUP_COLORS[group],
      kind,
      excluded: kind === "transfer",
      hidden: false,
      custom: false,
      sortOrder: (group === "Transfers" || group === "Other" ? 9000 : 0) + g * 100 + i,
    })
  )
);

/**
 * The 14 original category names -> their closest home in the new list.
 * Used once to migrate saved budgets, rules and manual edits, and at read time
 * for transactions whose stored category predates the new list (run
 * Settings -> Re-apply categories to file those precisely from Plaid's detail).
 */
export const LEGACY_ALIASES: Record<string, string> = {
  Income: "Other Income",
  Groceries: "Groceries",
  Shopping: "Shopping",
  Dining: "Restaurants & Bars",
  Transport: "Other Transport",
  Subscriptions: "Subscriptions",
  Housing: "Mortgage",
  "Debt Payment": "Loan Repayment",
  Utilities: "Other Utilities",
  Health: "Medical",
  Entertainment: "Entertainment & Recreation",
  Travel: "Travel & Vacation",
  Transfer: "Transfer",
  Other: UNCATEGORIZED,
};

// ---- registry ----

let registry = new Map<string, CategoryDef>(DEFAULT_CATEGORIES.map((c) => [c.name, c]));

/** Replace the active category list (called after loading it from the database / app data). */
export function registerCategories(defs: CategoryDef[] | undefined | null): void {
  if (!defs || defs.length === 0) return;
  registry = new Map(defs.map((c) => [c.name, c]));
}

export function allCategories(): CategoryDef[] {
  return [...registry.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function getCategory(name: string): CategoryDef | undefined {
  return registry.get(name);
}

/** Map any stored category name onto one that exists today. */
export function normalizeCategory(name: string | null | undefined): string {
  if (!name) return UNCATEGORIZED;
  if (registry.has(name)) return name;
  const alias = LEGACY_ALIASES[name];
  if (alias && registry.has(alias)) return alias;
  return UNCATEGORIZED;
}

export function categoryColor(name: string): string {
  return registry.get(name)?.color ?? GROUP_COLORS.Other;
}

export function isExcludedCategory(name: string): boolean {
  const c = registry.get(name);
  return Boolean(c && (c.excluded || c.kind === "transfer"));
}

export interface CategoryGroup {
  group: string;
  items: CategoryDef[];
}

/** Categories bucketed by group, in display order. Hidden ones are left out unless asked for. */
export function groupCategories(
  defs: CategoryDef[],
  opts: { includeHidden?: boolean; kinds?: CategoryKind[]; budgetable?: boolean } = {}
): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  const sorted = [...defs].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  for (const c of sorted) {
    if (c.hidden && !opts.includeHidden) continue;
    if (opts.kinds && !opts.kinds.includes(c.kind)) continue;
    if (opts.budgetable && (c.kind !== "expense" || c.excluded)) continue;
    let g = groups.find((x) => x.group === c.group);
    if (!g) groups.push((g = { group: c.group, items: [] }));
    g.items.push(c);
  }
  return groups;
}

export function defaultGroupColor(group: string): string {
  return GROUP_COLORS[group] ?? GROUP_COLORS.Other;
}

/** A custom category's name: trimmed, single-spaced, 2–40 characters. Returns null when invalid. */
export function cleanCategoryName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length >= 2 && name.length <= 40 ? name : null;
}
