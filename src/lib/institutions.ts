import { CountryCode, Institution, Products } from "plaid";
import { Account } from "./types";
import { getPlaidClient } from "./plaid";

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

export interface ResolvedInstitution {
  institution_id: string;
  name: string;
  oauth: boolean;
  routing_numbers: string[];
  products: string[];
  url?: string | null;
}

function scoreInstitution(inst: Institution, query: string): number {
  const name = inst.name.toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  if (name === q) score += 100;
  else if (name.startsWith(q)) score += 60;
  else if (name.includes(q)) score += 40;
  if (inst.products.includes(Products.Investments)) score += 25;
  if (inst.oauth) score += 10;
  // Prefer the brokerage / retirement portal over a similarly named bank.
  if (/\bbank\b/i.test(inst.name) && !/invest/i.test(inst.name)) score -= 30;
  return score;
}

/** Live lookup via Plaid `/institutions/search`. Returns null if nothing matches. */
export async function resolveBrokerInstitution(
  target: Exclude<LinkTarget, "bank">
): Promise<ResolvedInstitution | null> {
  const { query } = BROKER_SEARCH[target];
  const client = getPlaidClient();

  const search = async (products: Products[] | null) => {
    const resp = await client.institutionsSearch({
      query,
      country_codes: [CountryCode.Us],
      products,
      options: { include_optional_metadata: true },
    });
    return resp.data.institutions;
  };

  let results: Institution[] = [];
  try {
    results = await search([Products.Investments]);
  } catch {
    results = [];
  }
  if (results.length === 0) {
    try {
      results = await search(null);
    } catch {
      return null;
    }
  }
  if (results.length === 0) return null;

  const best = [...results].sort((a, b) => scoreInstitution(b, query) - scoreInstitution(a, query))[0];
  return {
    institution_id: best.institution_id,
    name: best.name,
    oauth: best.oauth,
    routing_numbers: best.routing_numbers ?? [],
    products: best.products.map(String),
    url: best.url,
  };
}

export type InstitutionGroup = "Fidelity" | "T. Rowe Price" | "Charles Schwab" | "Banks";

const GROUP_ORDER: InstitutionGroup[] = ["Fidelity", "T. Rowe Price", "Charles Schwab", "Banks"];

export function institutionGroup(name: string): InstitutionGroup {
  const n = name.toLowerCase();
  if (n.includes("fidelity")) return "Fidelity";
  if (n.includes("rowe")) return "T. Rowe Price";
  if (n.includes("schwab")) return "Charles Schwab";
  return "Banks";
}

export interface InstitutionBreakdown {
  group: InstitutionGroup;
  total: number;
  accounts: number;
}

/** Combined balances grouped as Fidelity / T. Rowe / Schwab / banks. */
export function breakdownByInstitution(accounts: Account[]): InstitutionBreakdown[] {
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
