import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getAppData } from "@/lib/data";
import { computeWeeklyDigest, renderDigestEmail } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly digest endpoint — invoked by Vercel Cron every Sunday (see vercel.json).
 *
 * Auth: when CRON_SECRET is set (recommended in production), requests must carry
 * `Authorization: Bearer <CRON_SECRET>` — Vercel Cron adds this automatically.
 *
 * Modes:
 *   GET /api/digest            -> compute + send the email
 *   GET /api/digest?preview=1  -> return the email HTML without sending (for testing)
 *
 * Sending: uses Resend when RESEND_API_KEY is set (recommended — free tier
 * delivers to your own address with zero domain setup); otherwise falls back
 * to Gmail SMTP via GMAIL_USER + GMAIL_APP_PASSWORD.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getAppData();
  const digest = computeWeeklyDigest(data);
  const { subject, html } = renderDigestEmail(digest);

  if (req.nextUrl.searchParams.get("preview")) {
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // --- Option A: Resend (RESEND_API_KEY) ---
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const to = process.env.DIGEST_TO;
    if (!to) {
      return NextResponse.json({ error: "Set DIGEST_TO to the recipient address." }, { status: 400 });
    }
    // Free tier without a verified domain must send from onboarding@resend.dev
    const from = process.env.EMAIL_FROM ?? "BudgetFlow <onboarding@resend.dev>";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Resend: ${json?.message ?? resp.statusText}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, via: "resend", sent: to, subject, mode: data.mode });
  }

  // --- Option B: Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD) ---
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json(
      { error: "Email not configured. Set RESEND_API_KEY (+ DIGEST_TO), or GMAIL_USER and GMAIL_APP_PASSWORD." },
      { status: 400 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  const to = process.env.DIGEST_TO ?? user;
  try {
    await transporter.sendMail({
      from: `"BudgetFlow" <${user}>`,
      to,
      subject,
      html,
    });
    return NextResponse.json({ ok: true, via: "gmail", sent: to, subject, mode: data.mode });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
