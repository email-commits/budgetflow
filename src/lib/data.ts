import { generateDemoData, BUDGETS } from "./mockData";
import {
  getPlaidClient,
  hasLinkedItem,
  mapPlaidAccount,
  mapPlaidTransaction,
  plaidConfigured,
  readStore,
} from "./plaid";
import { Account, AppData, Transaction } from "./types";

/** Fetch accounts + transactions from Plaid when configured & linked; demo data otherwise. */
export async function getAppData(): Promise<AppData> {
  if (!plaidConfigured() || !hasLinkedItem()) {
    return generateDemoData();
  }

  try {
    const client = getPlaidClient();
    const store = readStore();
    const accounts: Account[] = [];
    const transactions: Transaction[] = [];

    for (const item of store.items) {
      // institution info for logos
      let institution: { name?: string; domain?: string } | undefined;
      try {
        const itemResp = await client.itemGet({ access_token: item.accessToken });
        const instId = itemResp.data.item.institution_id;
        if (instId) {
          const instResp = await client.institutionsGetById({
            institution_id: instId,
            country_codes: ["US"] as never,
            options: { include_optional_metadata: true },
          });
          institution = {
            name: instResp.data.institution.name,
            domain: instResp.data.institution.url?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""),
          };
        }
      } catch {
        /* institution metadata is optional */
      }

      const acctResp = await client.accountsGet({ access_token: item.accessToken });
      for (const a of acctResp.data.accounts) accounts.push(mapPlaidAccount(a, institution));

      // full transactions/sync each request (simple; add cursor persistence + a DB for production)
      let cursor: string | undefined = undefined;
      let hasMore = true;
      while (hasMore) {
        const resp = await client.transactionsSync({
          access_token: item.accessToken,
          cursor,
          count: 500,
        });
        for (const t of resp.data.added) transactions.push(mapPlaidTransaction(t));
        cursor = resp.data.next_cursor;
        hasMore = resp.data.has_more;
      }
    }

    transactions.sort((a, b) => (a.date < b.date ? 1 : -1));
    return { mode: "plaid", accounts, transactions, budgets: BUDGETS };
  } catch (e) {
    console.error("Plaid fetch failed, serving demo data:", e);
    return generateDemoData();
  }
}
