import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { gunzipSync, gzipSync } from "zlib";
import type { PrismaClient } from "@prisma/client";
import { ensureCategories } from "./categoryStore";

/**
 * Full-database backup: every table -> JSON -> gzip -> AES-256-GCM.
 *
 * The encrypted file is safe to store anywhere (email, Drive, a USB stick):
 * without BACKUP_KEY it is unreadable. Keep BACKUP_KEY in a password manager —
 * if you lose it, the backups cannot be opened.
 *
 * File layout: "BFBK1" | salt(16) | iv(12) | tag(16) | ciphertext
 * Key: scrypt(BACKUP_KEY, salt) -> 32 bytes.
 */

const MAGIC = Buffer.from("BFBK1");
const FORMAT_VERSION = 1;

/** Tables in the order they must be restored (parents before children). */
export const BACKUP_TABLES = [
  "plaidItem",
  "account",
  "transaction",
  "holding",
  "rule",
  "budget",
  "manualAsset",
  "bill",
  "goal",
  "netWorthSnapshot",
  "category",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

/** DateTime columns per table — JSON turns these into strings, restore turns them back. */
const DATE_FIELDS: Record<BackupTable, string[]> = {
  plaidItem: ["lastSyncedAt", "createdAt"],
  account: [],
  transaction: [],
  holding: ["updatedAt"],
  rule: ["createdAt"],
  budget: [],
  manualAsset: ["updatedAt"],
  bill: ["createdAt"],
  goal: ["createdAt"],
  netWorthSnapshot: [],
  category: [],
};

type Row = Record<string, unknown>;

export interface BackupPayload {
  format: "budgetflow-backup";
  version: number;
  createdAt: string;
  counts: Record<BackupTable, number>;
  tables: Record<BackupTable, Row[]>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDelegate = { findMany: () => Promise<Row[]>; createMany: (args: any) => Promise<unknown>; count: () => Promise<number> };

function delegate(db: PrismaClient, table: BackupTable): AnyDelegate {
  return (db as unknown as Record<BackupTable, AnyDelegate>)[table];
}

/** Read every row of every table. Plaid tokens are included exactly as stored (already encrypted when ENCRYPTION_KEY is set). */
export async function dumpDatabase(db: PrismaClient): Promise<BackupPayload> {
  await ensureCategories(db); // the Category table creates itself on first use
  const tables = {} as Record<BackupTable, Row[]>;
  const counts = {} as Record<BackupTable, number>;
  for (const t of BACKUP_TABLES) {
    const rows = await delegate(db, t).findMany();
    tables[t] = rows;
    counts[t] = rows.length;
  }
  return {
    format: "budgetflow-backup",
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    counts,
    tables,
  };
}

export function encryptBackup(payload: BackupPayload, passphrase: string): Buffer {
  if (!passphrase) throw new Error("BACKUP_KEY is required to encrypt a backup.");
  const plain = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBackup(file: Buffer, passphrase: string): BackupPayload {
  if (file.length < MAGIC.length + 44 || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not a BudgetFlow backup file.");
  }
  let o = MAGIC.length;
  const salt = file.subarray(o, (o += 16));
  const iv = file.subarray(o, (o += 12));
  const tag = file.subarray(o, (o += 16));
  const ciphertext = file.subarray(o);
  const key = scryptSync(passphrase, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let plain: Buffer;
  try {
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Could not decrypt: wrong BACKUP_KEY, or the file is damaged.");
  }
  const payload = JSON.parse(gunzipSync(plain).toString("utf8")) as BackupPayload;
  if (payload.format !== "budgetflow-backup") throw new Error("Unexpected backup contents.");
  if (payload.version > FORMAT_VERSION) {
    throw new Error(`Backup format v${payload.version} is newer than this code understands.`);
  }
  return payload;
}

/**
 * Load a backup into a database. Refuses to touch a database that already has
 * data unless `force` is set, so a restore can never silently merge into or
 * overwrite a live database.
 */
export async function restoreDatabase(
  db: PrismaClient,
  payload: BackupPayload,
  opts: { force?: boolean } = {}
): Promise<Record<BackupTable, number>> {
  if (!opts.force) {
    for (const t of BACKUP_TABLES) {
      if ((await delegate(db, t).count()) > 0) {
        throw new Error(
          `Target database is not empty (table "${t}" has rows). Restore into a fresh database, or pass --force to add missing rows.`
        );
      }
    }
  }
  const restored = {} as Record<BackupTable, number>;
  for (const t of BACKUP_TABLES) {
    const rows = (payload.tables[t] ?? []).map((r) => {
      const row: Row = { ...r };
      for (const f of DATE_FIELDS[t]) {
        if (typeof row[f] === "string") row[f] = new Date(row[f] as string);
      }
      return row;
    });
    for (let i = 0; i < rows.length; i += 1000) {
      await delegate(db, t).createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
    }
    restored[t] = rows.length;
  }
  return restored;
}

/** Constant-time check of an `Authorization: Bearer <secret>` header. */
export function bearerMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function backupFilename(createdAt: string): string {
  return `budgetflow-backup-${createdAt.slice(0, 10)}.bfbk`;
}
