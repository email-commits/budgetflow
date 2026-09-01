/** Settings / Link targets. `bank` is the generic institution-select fallback. */
export type LinkTarget = "bank" | "fidelity" | "trowe" | "schwab";

export const LINK_TARGETS: LinkTarget[] = ["bank", "fidelity", "trowe", "schwab"];

export function isLinkTarget(value: unknown): value is LinkTarget {
  return typeof value === "string" && (LINK_TARGETS as string[]).includes(value);
}

export const BROKER_TARGETS: Exclude<LinkTarget, "bank">[] = ["fidelity", "trowe", "schwab"];

/**
 * Search queries for `/institutions/search` — names only, never guessed IDs.
 * IDs change when an institution migrates to OAuth or has multiple login portals
 * (see https://plaid.com/docs/api/institutions/).
 */
export const BROKER_SEARCH: Record<
  Exclude<LinkTarget, "bank">,
  { query: string; displayName: string; domain: string }
> = {
  fidelity: { query: "Fidelity Investments", displayName: "Fidelity", domain: "fidelity.com" },
  trowe: { query: "T. Rowe Price", displayName: "T. Rowe Price", domain: "troweprice.com" },
  schwab: { query: "Charles Schwab", displayName: "Charles Schwab", domain: "schwab.com" },
};

export type InstitutionGroup = "Fidelity" | "T. Rowe Price" | "Charles Schwab" | "Banks";

export function institutionGroup(name: string): InstitutionGroup {
  const n = name.toLowerCase();
  if (n.includes("fidelity")) return "Fidelity";
  if (n.includes("rowe")) return "T. Rowe Price";
  if (n.includes("schwab")) return "Charles Schwab";
  return "Banks";
}

const GROUP_ORDER: InstitutionGroup[] = ["Fidelity", "T. Rowe Price", "Charles Schwab", "Banks"];

export interface InstitutionBreakdown {
  group: InstitutionGroup;
  total: number;
  accounts: number;
}

/** Combined balances grouped as Fidelity / T. Rowe / Schwab / banks. */
export function breakdownByInstitution(
  accounts: Array<{ institution: string; balance: number }>
): InstitutionBreakdown[] {
  const map = new Map<InstitutionGroup, InstitutionBreakdown>();
  for (const g of GROUP_ORDER) map.set(g, { group: g, total: 0, accounts: 0 });
  for (const a of accounts) {
    const g = institutionGroup(a.institution);
    const row = map.get(g)!;
    row.total += a.balance;
    row.accounts += 1;
  }
  return GROUP_ORDER.map((g) => map.get(g)!).filter((row) => row.accounts > 0);
}
