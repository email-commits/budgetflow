import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_TABLES, BackupPayload, bearerMatches, decryptBackup, encryptBackup } from "./backup";

function sample(): BackupPayload {
  const tables = Object.fromEntries(BACKUP_TABLES.map((t) => [t, []])) as unknown as BackupPayload["tables"];
  tables.transaction = [{ id: "t1", accountId: "a1", date: "2026-01-02", merchant: "Café ☕", amount: -4.5 }];
  const counts = Object.fromEntries(BACKUP_TABLES.map((t) => [t, tables[t].length])) as BackupPayload["counts"];
  return { format: "budgetflow-backup", version: 1, createdAt: "2026-01-03T00:00:00.000Z", counts, tables };
}

test("backup round-trips through encrypt/decrypt", () => {
  const file = encryptBackup(sample(), "correct horse");
  assert.deepEqual(decryptBackup(file, "correct horse"), sample());
});

test("encrypted file does not contain plaintext", () => {
  const file = encryptBackup(sample(), "correct horse");
  assert.equal(file.includes(Buffer.from("merchant")), false);
  assert.equal(file.includes(Buffer.from("Café")), false);
});

test("wrong key and tampering are rejected", () => {
  const file = encryptBackup(sample(), "correct horse");
  assert.throws(() => decryptBackup(file, "wrong"), /wrong BACKUP_KEY/);
  const tampered = Buffer.from(file);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptBackup(tampered, "correct horse"), /wrong BACKUP_KEY/);
  assert.throws(() => decryptBackup(Buffer.from("hello"), "correct horse"), /Not a BudgetFlow backup/);
});

test("bearer check", () => {
  assert.equal(bearerMatches("Bearer s3cret", "s3cret"), true);
  assert.equal(bearerMatches("Bearer s3creT", "s3cret"), false);
  assert.equal(bearerMatches("Bearer s3cret-longer", "s3cret"), false);
  assert.equal(bearerMatches(null, "s3cret"), false);
});
