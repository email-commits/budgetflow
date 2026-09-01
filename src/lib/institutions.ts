import { CountryCode, Institution, Products } from "plaid";
import { getPlaidClient } from "./plaid";
import { BROKER_SEARCH, LinkTarget } from "./institutions-client";

export type { LinkTarget, InstitutionGroup, InstitutionBreakdown } from "./institutions-client";
export {
  LINK_TARGETS,
  isLinkTarget,
  BROKER_TARGETS,
  BROKER_SEARCH,
  institutionGroup,
  breakdownByInstitution,
} from "./institutions-client";

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
