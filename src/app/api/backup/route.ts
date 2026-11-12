import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { dbConfigured, getDb } from "@/lib/db";
import { backupFilename, bearerMatches, dumpDatabase, encryptBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly encrypted backup — invoked by Vercel Cron (see vercel.json).
 *
 * Dumps every table, encrypts the dump with BACKUP_KEY (AES-256-GCM) and emails
 * it as an attachment, so a copy of your full history lives outside the database.
 *
 * Unlike the digest routes this one FAILS CLOSED: it refuses to run unless both
 * CRON_SECRET and BACKUP_KEY are set, and every request must carry
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron adds this automatically).
 *
 * Modes:
 *   GET /api/backup              -> build + email the encrypted backup
 *   GET /api/backup?download=1   -> return the encrypted file instead of emailing
 *
 * Recipient: BACKUP_TO, falling back to DIGEST_TO (then GMAIL_USER).
 * Open a backup with:  npm run backup:decrypt -- <file>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const backupKey = process.env.BACKUP_KEY;
  if (!secret || !backupKey) {
    return NextResponse.json(
      { error: "Backups are disabled: set both CRON_SECRET and BACKUP_KEY." },
      { status: 503 }
    );
  }
  if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ error: "No database configured — nothing to back up." }, { status: 400 });
  }

  let file: Buffer;
  let filename: string;
  let counts: Record<string, number>;
  try {
    const payload = await dumpDatabase(getDb());
    file = encryptBackup(payload, backupKey);
    filename = backupFilename(payload.createdAt);
    counts = payload.counts;
  } catch (e) {
    console.error("Backup failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "backup failed" }, { status: 500 });
  }

  if (req.nextUrl.searchParams.get("download")) {
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Deliberately no balances or merchants in the email body — only row counts.
  const subject = `BudgetFlow backup ${filename.slice(18, 28)}`;
  const lines = Object.entries(counts).map(([t, n]) => `${t}: ${n}`);
  const text =
    `Encrypted backup attached (${(file.length / 1024).toFixed(0)} KB).\n\n` +
    `Rows saved:\n${lines.join("\n")}\n\n` +
    `Keep this email. To open the file you need BACKUP_KEY:\n` +
    `  npm run backup:decrypt -- ${filename}\n`;

  // --- Option A: Resend ---
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const to = process.env.BACKUP_TO ?? process.env.DIGEST_TO;
    if (!to) {
      return NextResponse.json({ error: "Set BACKUP_TO (or DIGEST_TO) to the recipient address." }, { status: 400 });
    }
    const from = process.env.EMAIL_FROM ?? "BudgetFlow <onboarding@resend.dev>";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        attachments: [{ filename, content: file.toString("base64") }],
      }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json({ error: `Resend: ${json?.message ?? resp.statusText}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, via: "resend", sent: to, filename, bytes: file.length, counts });
  }

  // --- Option B: Gmail SMTP ---
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json(
      { error: "Email not configured. Set RESEND_API_KEY (+ BACKUP_TO or DIGEST_TO), or GMAIL_USER and GMAIL_APP_PASSWORD." },
      { status: 400 }
    );
  }
  const to = process.env.BACKUP_TO ?? process.env.DIGEST_TO ?? user;
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `"BudgetFlow" <${user}>`,
      to,
      subject,
      text,
      attachments: [{ filename, content: file }],
    });
    return NextResponse.json({ ok: true, via: "gmail", sent: to, filename, bytes: file.length, counts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "send failed" }, { status: 500 });
  }
}
