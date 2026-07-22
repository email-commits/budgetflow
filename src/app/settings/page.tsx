"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { useAppData } from "@/components/DataProvider";
import { CATEGORY_COLORS, fmtUSD0 } from "@/lib/analytics";
import { Category, ManualAsset, Rule } from "@/lib/types";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plaid?: any;
  }
}

const LINK_TOKEN_KEY = "budgetflow_plaid_link_token";

interface BankInfo {
  id: string;
  name: string;
  domain?: string;
  accounts: number;
  lastSyncedAt?: string;
}

const RULE_CATEGORIES: Category[] = [
  "Income",
  "Groceries",
  "Shopping",
  "Dining",
  "Transport",
  "Subscriptions",
  "Housing",
  "Utilities",
  "Health",
  "Entertainment",
  "Travel",
  "Other",
];

function RulesCard({ rules, onChanged }: { rules: Rule[]; onChanged: () => Promise<void> }) {
  const [match, setMatch] = useState("");
  const [setCategory, setSetCategory] = useState<Category | "">("");
  const [renameTo, setRenameTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match,
          setCategory: setCategory || undefined,
          renameTo: renameTo || undefined,
        }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed");
      setMatch("");
      setSetCategory("");
      setRenameTo("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add rule");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await onChanged();
  };

  return (
    <div className="card p-6 space-y-4">
      <div>
        <h2 className="font-medium">Rules</h2>
        <p className="text-sm text-ink-muted mt-0.5">
          Automatically recategorize or rename transactions by merchant. Applied to everything, past and future.
        </p>
      </div>

      {rules.length > 0 && (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center gap-3 bg-surface2 rounded-xl px-4 py-2.5 text-sm">
              <span className="text-ink-secondary">
                &ldquo;<b className="text-ink-primary">{r.match}</b>&rdquo;
              </span>
              <span className="text-ink-muted">→</span>
              <span className="flex items-center gap-2 flex-1 min-w-0">
                {r.setCategory && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[r.setCategory] }} />
                    {r.setCategory}
                  </span>
                )}
                {r.renameTo && <span className="text-ink-secondary truncate">rename to &ldquo;{r.renameTo}&rdquo;</span>}
              </span>
              <button onClick={() => remove(r.id)} className="text-xs text-ink-muted hover:text-critical shrink-0">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          placeholder="Merchant contains…"
          className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-44 outline-none focus:border-series-1 placeholder:text-ink-muted"
        />
        <select
          value={setCategory}
          onChange={(e) => setSetCategory(e.target.value as Category)}
          className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"
        >
          <option value="">Category (optional)</option>
          {RULE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={renameTo}
          onChange={(e) => setRenameTo(e.target.value)}
          placeholder="Rename to (optional)"
          className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-44 outline-none focus:border-series-1 placeholder:text-ink-muted"
        />
        <button
          onClick={add}
          disabled={busy || match.trim().length < 2 || (!setCategory && !renameTo)}
          className="bg-series-1 text-white text-sm rounded-xl px-4 py-2 disabled:opacity-40"
        >
          Add rule
        </button>
      </div>
      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}

function AICard({ enabled, onChanged }: { enabled: boolean; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const resp = await fetch("/api/ai/categorize", { method: "POST" });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error ?? "Failed");
      setResult(
        json.created > 0
          ? `Created ${json.created} rule${json.created === 1 ? "" : "s"} from ${json.examined} uncategorized merchants. Review them below.`
          : (json.note ?? "No confident matches found.")
      );
      await onChanged();
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">AI</h2>
          <p className="text-sm text-ink-muted mt-0.5">
            Auto-categorize unknown merchants and power the Assistant page.
          </p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full border ${
            enabled ? "text-good border-good/40" : "text-warning border-warning/40"
          }`}
        >
          {enabled ? "Enabled" : "Needs API key"}
        </span>
      </div>
      {enabled ? (
        <button
          onClick={run}
          disabled={busy}
          className="bg-series-1 text-white text-sm font-medium rounded-xl px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Categorizing…" : "Categorize unknown merchants"}
        </button>
      ) : (
        <p className="text-sm text-ink-secondary">
          Get a key at <span className="text-series-1">console.anthropic.com</span> and add{" "}
          <code className="bg-surface2 px-1.5 py-0.5 rounded">ANTHROPIC_API_KEY=sk-ant-...</code> to{" "}
          <code className="bg-surface2 px-1.5 py-0.5 rounded">.env.local</code>, then restart.
        </p>
      )}
      {result && <p className="text-sm text-ink-secondary">{result}</p>}
    </div>
  );
}

const ASSET_KINDS: { value: ManualAsset["kind"]; label: string }[] = [
  { value: "property", label: "Property" },
  { value: "vehicle", label: "Vehicle" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other asset" },
  { value: "liability", label: "Liability (counts negative)" },
];

function AssetsCard({ assets, onChanged }: { assets: ManualAsset[]; onChanged: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ManualAsset["kind"]>("property");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind, value: Number(value) }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error ?? "Failed");
      setName("");
      setValue("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  };

  const saveValue = async (id: string) => {
    setBusy(true);
    try {
      await fetch("/api/assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, value: Number(editValue) }),
      });
      await onChanged();
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/assets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await onChanged();
  };

  return (
    <div className="card p-6 space-y-4">
      <div>
        <h2 className="font-medium">Manual assets &amp; liabilities</h2>
        <p className="text-sm text-ink-muted mt-0.5">
          Track things banks don&apos;t know about — your home, vehicles, cash, private loans. Counted in net worth.
        </p>
      </div>

      {assets.length > 0 && (
        <div className="space-y-2">
          {assets.map((a) => (
            <div key={a.id} className="flex items-center gap-3 bg-surface2 rounded-xl px-4 py-2.5 text-sm">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{a.name}</span>
                <span className="text-ink-muted text-xs ml-2">{ASSET_KINDS.find((k) => k.value === a.kind)?.label}</span>
              </div>
              {editingId === a.id ? (
                <>
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="w-28 bg-surface border border-white/10 rounded-lg px-2 py-1 text-sm tabular outline-none focus:border-series-1"
                    autoFocus
                  />
                  <button onClick={() => saveValue(a.id)} disabled={busy} className="text-xs text-series-1">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-ink-muted">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className={`tabular ${a.kind === "liability" ? "text-serious" : ""}`}>
                    {a.kind === "liability" ? "-" : ""}
                    {fmtUSD0(a.value)}
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(a.id);
                      setEditValue(String(a.value));
                    }}
                    className="text-xs text-ink-muted hover:text-ink-primary"
                  >
                    Edit
                  </button>
                  <button onClick={() => remove(a.id)} className="text-xs text-ink-muted hover:text-critical">
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Home)"
          className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-40 outline-none focus:border-series-1 placeholder:text-ink-muted"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ManualAsset["kind"])}
          className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"
        >
          {ASSET_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Value ($)"
          className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-28 outline-none focus:border-series-1 placeholder:text-ink-muted"
        />
        <button
          onClick={add}
          disabled={busy || !name.trim() || !value}
          className="bg-series-1 text-white text-sm rounded-xl px-4 py-2 disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const { data, refresh } = useAppData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const removeBank = async (id: string) => {
    if (confirmRemove !== id) {
      setConfirmRemove(id);
      return;
    }
    setConfirmRemove(null);
    await fetch(`/api/banks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
    await loadBanks();
  };

  const loadBanks = useCallback(async () => {
    try {
      const resp = await fetch("/api/banks");
      const json = await resp.json();
      setBanks(json.banks ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      await refresh();
      await loadBanks();
    } finally {
      setSyncing(false);
    }
  };

  const handleSuccess = useCallback(
    async (public_token: string) => {
      try {
        const ex = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token }),
        });
        const json = await ex.json();
        if (!ex.ok) throw new Error(json.error ?? "Token exchange failed");
        setLinked(true);
        if (json.persisted === false && json.accessToken) {
          // Deployed (read-only filesystem): show the token once so it can be
          // moved into the PLAID_ACCESS_TOKEN env var.
          setPendingToken(json.accessToken);
        }
        await refresh();
        await loadBanks();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Token exchange failed");
      } finally {
        localStorage.removeItem(LINK_TOKEN_KEY);
        setBusy(false);
      }
    },
    [refresh, loadBanks]
  );

  // Resume an OAuth redirect (real banks like Chase bounce through the bank's
  // site and return here with ?oauth_state_id=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("oauth_state_id")) return;
    const token = localStorage.getItem(LINK_TOKEN_KEY);
    if (!token || !window.Plaid) return;
    setBusy(true);
    const handler = window.Plaid.create({
      token,
      receivedRedirectUri: window.location.href,
      onSuccess: handleSuccess,
      onExit: () => setBusy(false),
    });
    handler.open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/plaid/create_link_token", { method: "POST" });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error ?? "Could not create link token");
      if (!window.Plaid) throw new Error("Plaid Link script not loaded yet — try again in a second.");

      // Persist the link token so the OAuth redirect flow can resume with it
      localStorage.setItem(LINK_TOKEN_KEY, json.link_token);

      const handler = window.Plaid.create({
        token: json.link_token,
        onSuccess: handleSuccess,
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
              {data?.mode === "plaid" || linked ? "Live data via Plaid" : "Currently showing demo data"}
            </p>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full border ${
              data?.mode === "plaid" || linked ? "text-good border-good/40" : "text-warning border-warning/40"
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

        {banks.length > 0 && (
          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-ink-secondary">Linked banks</h3>
              <button
                onClick={syncNow}
                disabled={syncing}
                className="text-xs text-series-1 hover:underline disabled:opacity-50"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>
            {banks.map((b) => (
              <div key={b.id} className="flex items-center justify-between bg-surface2 rounded-xl px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{b.name}</div>
                  <div className="text-xs text-ink-muted">
                    {b.accounts} account{b.accounts === 1 ? "" : "s"}
                    {b.lastSyncedAt &&
                      ` · synced ${new Date(b.lastSyncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => removeBank(b.id)}
                    onBlur={() => setConfirmRemove(null)}
                    className={`text-xs ${
                      confirmRemove === b.id ? "text-critical font-medium" : "text-ink-muted hover:text-critical"
                    }`}
                  >
                    {confirmRemove === b.id ? "Click again to remove" : "Remove"}
                  </button>
                  <span className="w-2 h-2 rounded-full bg-good" />
                </div>
              </div>
            ))}
          </div>
        )}

        {pendingToken && (
          <div className="border border-warning/40 rounded-xl p-4 space-y-2">
            <p className="text-sm text-warning font-medium">One more step to make this stick</p>
            <p className="text-sm text-ink-secondary">
              This server can&apos;t store tokens. Copy the access token below into the{" "}
              <code className="bg-surface2 px-1.5 py-0.5 rounded">PLAID_ACCESS_TOKEN</code> environment variable
              (e.g. in Vercel), then redeploy. It is shown only this once.
            </p>
            <pre className="bg-surface2 rounded-xl p-3 text-xs overflow-x-auto select-all">{pendingToken}</pre>
          </div>
        )}
      </div>

      {data?.editable && <AICard enabled={Boolean(data?.ai)} onChanged={refresh} />}

      {data?.editable && <RulesCard rules={data.rules ?? []} onChanged={refresh} />}

      {data?.editable && <AssetsCard assets={data.manualAssets ?? []} onChanged={refresh} />}

      <div className="card p-6 space-y-3 text-sm leading-relaxed text-ink-secondary">
        <h2 className="font-medium text-ink-primary">Sandbox vs. production</h2>
        <p>
          <b>Sandbox</b> (<code className="bg-surface2 px-1.5 py-0.5 rounded">PLAID_ENV=sandbox</code>): pick any
          bank, sign in with <code className="bg-surface2 px-1.5 py-0.5 rounded">user_good</code> /{" "}
          <code className="bg-surface2 px-1.5 py-0.5 rounded">pass_good</code>, phone{" "}
          <code className="bg-surface2 px-1.5 py-0.5 rounded">415-555-0011</code>, code{" "}
          <code className="bg-surface2 px-1.5 py-0.5 rounded">123456</code>.
        </p>
        <p>
          <b>Production</b> (<code className="bg-surface2 px-1.5 py-0.5 rounded">PLAID_ENV=production</code>): needs
          approved production access at dashboard.plaid.com, your production secret, and — for OAuth banks like
          Chase — <code className="bg-surface2 px-1.5 py-0.5 rounded">PLAID_REDIRECT_URI</code> set to this page&apos;s
          URL and registered under Allowed redirect URIs in the Plaid dashboard.
        </p>
      </div>
    </div>
  );
}
