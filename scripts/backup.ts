/**
 * Open or restore a BudgetFlow backup file (.bfbk).
 *
 *   npm run backup:decrypt -- <file.bfbk> [out.json]   write the readable JSON
 *   npm run backup:restore -- <file.bfbk> [--force]    load it into DATABASE_URL
 *
 * Needs BACKUP_KEY in the environment (or in .env.local). Restore also needs
 * DATABASE_URL pointing at a database whose tables exist (npm run db:push) and
 * are empty — it refuses to write into a database that already has data unless
 * you pass --force, which only adds rows that are missing.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { decryptBackup, restoreDatabase } from "../src/lib/backup";

function loadEnvFile(name: string) {
  const p = path.join(process.cwd(), name);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const [mode, file, ...rest] = process.argv.slice(2);
  if ((mode !== "decrypt" && mode !== "restore") || !file) {
    console.error("Usage: backup.ts decrypt <file.bfbk> [out.json] | restore <file.bfbk> [--force]");
    process.exit(2);
  }
  const key = process.env.BACKUP_KEY;
  if (!key) {
    console.error("BACKUP_KEY is not set (environment or .env.local).");
    process.exit(2);
  }

  const payload = decryptBackup(fs.readFileSync(file), key);
  console.log(`Backup from ${payload.createdAt}`);
  for (const [t, n] of Object.entries(payload.counts)) console.log(`  ${t}: ${n}`);

  if (mode === "decrypt") {
    const out = rest.find((a) => !a.startsWith("--")) ?? file.replace(/\.bfbk$/, "") + ".json";
    fs.writeFileSync(out, JSON.stringify(payload, null, 2));
    console.log(`Wrote ${out} — this file is NOT encrypted; delete it when you're done.`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — nowhere to restore to.");
    process.exit(2);
  }
  const db = new PrismaClient();
  try {
    const restored = await restoreDatabase(db, payload, { force: rest.includes("--force") });
    console.log("Restored:");
    for (const [t, n] of Object.entries(restored)) console.log(`  ${t}: ${n}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
