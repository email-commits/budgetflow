import { PlaidApi } from "plaid";
import { PrismaClient } from "@prisma/client";
import { getDb } from "./db";
import { decryptToken, encryptToken, encryptionEnabled, isEncrypted } from "./crypto";
import {
  fetchHoldings,
  getPlaidClient,
  isMissingProductError,
  mapPlaidAccount,
  mapPlaidTransaction,
  plaidConfigured,
  readStore,
} from "./plaid";

const STALE_AFTER_MS = 15 * 60 * 1000; // re-sync at most every 15 minutes

/** Look up institution name/domain for an access token (best effort). */
async function fetchInstitution(
  client: PlaidApi,
  accessToken: string
): Promise<{ itemId: string; name?: string; domain?: string }> {
  const itemResp = await client.itemGet({ access_token: accessToken });
  const itemId = itemResp.data.item.item_id;
  let name: string | undefined;
  let domain: string | undefined;
  const instId = itemResp.data.item.institution_id;
  if (instId) {
    try {
      const instResp = await client.institutionsGetById({
        institution_id: instId,
        country_codes: ["US"] as never,
        options: { include_optional_metadata: true },
      });
      name = instResp.data.institution.name;
      domain = instResp.data.institution.url?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
    } catch {
      /* optional */
    }
  }
  return { itemId, name, domain };
}

/** Register a new bank connection in the DB (called from the exchange route). */
export async function registerItem(accessToken: string): Promise<string> {
  const db = getDb();
  const client = getPlaidClient();
  const inst = await fetchInstitution(client, accessToken);
  const stored = encryptToken(accessToken); // encrypted at rest when ENCRYPTION_KEY is set
  await db.plaidItem.upsert({
    where: { id: inst.itemId },
    update: { accessToken: stored, institutionName: inst.name, institutionDomain: inst.domain },
    create: {
      id: inst.itemId,
      accessToken: stored,
      institutionName: inst.name,
      institutionDomain: inst.domain,
    },
  });
  return inst.itemId;
}

/** One-time migration: pull tokens from .plaid-store.json / PLAID_ACCESS_TOKEN into the DB. */
async function importLegacyTokens(db: PrismaClient): Promise<void> {
  const count = await db.plaidItem.count();
  if (count > 0) return;
  const store = readStore();
  for (const item of store.items) {
    try {
      await registerItem(item.accessToken);
    } catch (e) {
      console.error("Legacy token import failed:", e);
    }
  }
}

/** Incremental sync of a single item: accounts + cursor-based transactions. */
async function syncItem(
  db: PrismaClient,
  client: PlaidApi,
  item: { id: string; accessToken: string; cursor: string | null; institutionName: string | null; institutionDomain: string | null }
): Promise<void> {
  const accessToken = decryptToken(item.accessToken);
  // accounts + balances
  const acctResp = await client.accountsGet({ access_token: accessToken });
  for (const a of acctResp.data.accounts) {
    const mapped = mapPlaidAccount(a, {
      name: item.institutionName ?? undefined,
      domain: item.institutionDomain ?? undefined,
    });
    await db.account.upsert({
      where: { id: mapped.id },
      update: {
        name: mapped.name,
        balance: mapped.balance,
        type: mapped.type,
        subtype: mapped.subtype ?? null,
        mask: mapped.mask,
      },
      create: {
        id: mapped.id,
        itemId: item.id,
        name: mapped.name,
        institution: mapped.institution,
        institutionDomain: mapped.institutionDomain,
        type: mapped.type,
        subtype: mapped.subtype ?? null,
        mask: mapped.mask,
        balance: mapped.balance,
      },
    });
  }

  // transactions via cursor — batched writes (critical for the initial 2-year backfill).
  // Brokerage-only Items may not have Transactions; skip quietly in that case.
  const validAccountIds = new Set(acctResp.data.accounts.map((a) => a.account_id));
  let cursor = item.cursor ?? undefined;
  try {
    let hasMore = true;
    while (hasMore) {
      const resp = await client.transactionsSync({
        access_token: accessToken,
        cursor,
        count: 500,
      });

      // new transactions: one bulk insert per page instead of one write per row
      const added = resp.data.added
        .filter((t) => validAccountIds.has(t.account_id))
        .map((t) => {
          const m = mapPlaidTransaction(t);
          return {
            id: m.id,
            accountId: m.accountId,
            date: m.date,
            merchant: m.merchant,
            merchantDomain: m.merchantDomain ?? null,
            logoUrl: m.logoUrl ?? null,
            category: m.category,
            amount: m.amount,
            pending: m.pending ?? false,
          };
        });
      if (added.length > 0) {
        await db.transaction.createMany({ data: added, skipDuplicates: true });
      }

      // modified are rare — per-row updates are fine
      for (const t of resp.data.modified) {
        if (!validAccountIds.has(t.account_id)) continue;
        const m = mapPlaidTransaction(t);
        await db.transaction
          .update({
            where: { id: m.id },
            data: {
              date: m.date,
              merchant: m.merchant,
              merchantDomain: m.merchantDomain ?? null,
              logoUrl: m.logoUrl ?? null,
              category: m.category,
              amount: m.amount,
              pending: m.pending ?? false,
            },
          })
          .catch(() => {}); // modified row we never inserted — ignore
      }

      if (resp.data.removed.length > 0) {
        await db.transaction.deleteMany({
          where: { id: { in: resp.data.removed.map((r) => r.transaction_id!).filter(Boolean) } },
        });
      }
      cursor = resp.data.next_cursor;
      hasMore = resp.data.has_more;
    }
  } catch (e) {
    if (!isMissingProductError(e)) throw e;
  }

  // `/investments/holdings/get` — requires the Investments product on the Item
  try {
    const mappedHoldings = await fetchHoldings(
      client,
      accessToken,
      acctResp.data.accounts.map((a) => ({ id: a.account_id, name: a.name }))
    );
    const seen = new Set<string>();
    for (const h of mappedHoldings) {
      if (!validAccountIds.has(h.accountId)) continue;
      seen.add(h.id);
      const data = {
        name: h.name,
        ticker: h.ticker ?? null,
        type: h.type ?? null,
        quantity: h.quantity,
        value: h.value,
        costBasis: h.costBasis ?? null,
      };
      await db.holding.upsert({
        where: { id: h.id },
        update: data,
        create: { id: h.id, accountId: h.accountId, ...data },
      });
    }
    await db.holding.deleteMany({
      where: {
        accountId: { in: [...validAccountIds] },
        ...(seen.size > 0 ? { id: { notIn: [...seen] } } : {}),
      },
    });
  } catch (e) {
    if (!isMissingProductError(e)) {
      console.warn(`Holdings sync skipped for item ${item.id}:`, e);
    }
  }

  await db.plaidItem.update({
    where: { id: item.id },
    data: { cursor, lastSyncedAt: new Date() },
  });
}

/** Record (or refresh) today's net-worth snapshot from current balances + manual assets. */
export async function recordSnapshot(db: PrismaClient): Promise<void> {
  const [accounts, manualAssets] = await Promise.all([db.account.findMany(), db.manualAsset.findMany()]);
  if (accounts.length === 0 && manualAssets.length === 0) return;
  let cash = 0,
    investments = 0,
    liabilities = 0;
  for (const a of accounts) {
    if (a.type === "checking" || a.type === "savings") cash += a.balance;
    else if (a.type === "investment") investments += a.balance;
    else if (a.type === "credit" || a.type === "loan") liabilities += a.balance; // already negative
    else cash += a.balance;
  }
  const manual = manualAssets.reduce(
    (s, m) => s + (m.kind === "liability" ? -Math.abs(m.value) : m.value),
    0
  );
  const total = cash + investments + liabilities + manual;
  const date = new Date().toISOString().slice(0, 10);
  await db.netWorthSnapshot.upsert({
    where: { date },
    update: { total, cash, investments, liabilities, manual },
    create: { date, total, cash, investments, liabilities, manual },
  });
}

/** Sync all linked banks. Skips items synced within the staleness window unless force=true. */
export async function syncAll(force = false): Promise<{ synced: number; skipped: number; errors: number }> {
  if (!plaidConfigured()) return { synced: 0, skipped: 0, errors: 0 };
  const db = getDb();
  await importLegacyTokens(db);
  const client = getPlaidClient();
  const items = await db.plaidItem.findMany();
  let synced = 0,
    skipped = 0,
    errors = 0;
  for (const item of items) {
    // lazy migration: encrypt plaintext tokens once ENCRYPTION_KEY is set
    if (encryptionEnabled() && !isEncrypted(item.accessToken)) {
      const encrypted = encryptToken(item.accessToken);
      await db.plaidItem.update({ where: { id: item.id }, data: { accessToken: encrypted } });
      item.accessToken = encrypted;
    }
    const fresh = item.lastSyncedAt && Date.now() - item.lastSyncedAt.getTime() < STALE_AFTER_MS;
    if (fresh && !force) {
      skipped++;
      continue;
    }
    try {
      await syncItem(db, client, item);
      synced++;
    } catch (e) {
      errors++;
      console.error(`Sync failed for item ${item.id}:`, e);
    }
  }
  if (synced > 0) {
    try {
      await recordSnapshot(db);
    } catch (e) {
      console.error("Snapshot failed:", e);
    }
  }
  return { synced, skipped, errors };
}
