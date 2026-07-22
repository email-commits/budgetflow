import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getAppData } from "@/lib/data";
import { renderMonthlyEmail } from "@/lib/digest";
import { computeMonthlyReview, shiftMonth } from "@/lib/review";
import { monthKey } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Monthly Review email — invoked by Vercel Cron on the 1st (see vercel.json).
 * Reviews the month that just ENDED. Same auth & preview modes as /api/digest.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getAppData();
  // on the 1st we review the previous month; ?month=yyyy-mm overrides for testing
  const requested = req.nextUrl.searchParams.get("month");
  const target = requested ?? shiftMonth(monthKey(new Date().toISOString().slice(0, 10)), -1);
  const review = computeMonthlyReview(data, target);
  const { subject, html } = renderMonthlyEmail(review);

  if (req.nextUrl.searchParams.get("preview")) {
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const to = process.env.DIGEST_TO;
    if (!to) return NextResponse.json({ error: "Set DIGEST_TO." }, { status: 400 });
    const from = process.env.EMAIL_FROM ?? "BudgetFlow <onboarding@resend.dev>";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json({ error: `Resend: ${json?.message ?? resp.statusText}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, via: "resend", sent: to, subject });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return NextResponse.json({ error: "Email not configured." }, { status: 400 });
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  const to = process.env.DIGEST_TO ?? user;
  try {
    await transporter.sendMail({ from: `"BudgetFlow" <${user}>`, to, subject, html });
    return NextResponse.json({ ok: true, via: "gmail", sent: to, subject });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "send failed" }, { status: 500 });
  }
}
