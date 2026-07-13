"use client";

import { useState } from "react";
import Script from "next/script";
import { useAppData } from "@/components/DataProvider";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plaid?: any;
  }
}

export default function SettingsPage() {
  const { data, refresh } = useAppData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/plaid/create_link_token", { method: "POST" });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error ?? "Could not create link token");
      if (!window.Plaid) throw new Error("Plaid Link script not loaded yet — try again in a second.");

      const handler = window.Plaid.create({
        token: json.link_token,
        onSuccess: async (public_token: string) => {
          const ex = await fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_token }),
          });
          if (ex.ok) {
            setLinked(true);
            await refresh();
          } else {
            setError("Token exchange failed — check the server logs.");
          }
          setBusy(false);
        },
        onExit: () => setBusy(false),
      });
      handler.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js" strategy="afterInteractive" />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-ink-muted mt-1">Connect your bank accounts through Plaid</p>
      </header>

      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Bank connection</h2>
            <p className="text-sm text-ink-muted mt-0.5">
              {data?.mode === "plaid" || linked
                ? "Live data via Plaid"
                : "Currently showing demo data"}
            </p>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full border ${
              data?.mode === "plaid" || linked
                ? "text-good border-good/40"
                : "text-warning border-warning/40"
            }`}
          >
            {data?.mode === "plaid" || linked ? "Connected" : "Demo mode"}
          </span>
        </div>

        <button
          onClick={connect}
          disabled={busy}
          className="bg-series-1 hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-5 py-2.5 transition-opacity"
        >
          {busy ? "Opening Plaid Link…" : "Connect a bank with Plaid"}
        </button>

        {error && <p className="text-sm text-critical">{error}</p>}
      </div>

      <div className="card p-6 space-y-3 text-sm leading-relaxed text-ink-secondary">
        <h2 className="font-medium text-ink-primary">Setting up your Plaid keys</h2>
        <ol className="list-decimal ml-5 space-y-2">
          <li>
            Create a free account at{" "}
            <a href="https://dashboard.plaid.com/signup" className="text-series-1 hover:underline" target="_blank">
              dashboard.plaid.com
            </a>{" "}
            and grab your <b>client_id</b> and <b>sandbox secret</b> from Team Settings → Keys.
          </li>
          <li>
            Create a file called <code className="bg-surface2 px-1.5 py-0.5 rounded">.env.local</code> in the project
            root:
            <pre className="bg-surface2 rounded-xl p-3 mt-2 text-xs overflow-x-auto">
{`PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox`}
            </pre>
          </li>
          <li>Restart the dev server, come back here, and click “Connect a bank with Plaid”.</li>
          <li>
            In sandbox, pick any institution and log in with{" "}
            <code className="bg-surface2 px-1.5 py-0.5 rounded">user_good</code> /{" "}
            <code className="bg-surface2 px-1.5 py-0.5 rounded">pass_good</code>.
          </li>
        </ol>
        <p className="text-xs text-ink-muted pt-1">
          Until keys are configured, the app runs on realistic demo data so every screen still works.
        </p>
      </div>
    </div>
  );
}
