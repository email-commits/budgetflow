"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { BROKER_SEARCH, BROKER_TARGETS, LinkTarget } from "@/lib/institutions-client";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Plaid?: any;
  }
}

const LINK_TOKEN_KEY = "budgetflow_plaid_link_token";

interface PlaidExitError {
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
}

function formatPlaidExit(err: PlaidExitError): string {
  const msg = err.display_message || err.error_message || "Link exited with an error";
  return `Plaid Link: ${msg}${err.error_code ? ` (${err.error_code})` : ""}`;
}

export interface UsePlaidConnect {
  busy: boolean;
  busyTarget: LinkTarget | null;
  error: string | null;
  linked: boolean;
  pendingToken: string | null;
  connect: (target?: LinkTarget) => Promise<void>;
}

export function usePlaidConnect(onLinked?: () => Promise<void>): UsePlaidConnect {
  const [busy, setBusy] = useState(false);
  const [busyTarget, setBusyTarget] = useState<LinkTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);

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
          setPendingToken(json.accessToken);
        }
        await onLinked?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Token exchange failed");
      } finally {
        localStorage.removeItem(LINK_TOKEN_KEY);
        setBusy(false);
        setBusyTarget(null);
      }
    },
    [onLinked]
  );

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
      onExit: (err: PlaidExitError) => {
        if (err) setError(formatPlaidExit(err));
        setBusy(false);
        setBusyTarget(null);
      },
    });
    handler.open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(
    async (target: LinkTarget = "bank") => {
      setBusy(true);
      setBusyTarget(target);
      setError(null);
      try {
        const resp = await fetch("/api/plaid/create_link_token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target }),
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error ?? "Could not create link token");
        if (!window.Plaid) throw new Error("Plaid Link script not loaded yet — try again in a second.");

        localStorage.setItem(LINK_TOKEN_KEY, json.link_token);

        const handler = window.Plaid.create({
          token: json.link_token,
          onSuccess: handleSuccess,
          onExit: (err: PlaidExitError) => {
            if (err) setError(formatPlaidExit(err));
            setBusy(false);
            setBusyTarget(null);
          },
        });
        handler.open();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setBusy(false);
        setBusyTarget(null);
      }
    },
    [handleSuccess]
  );

  return { busy, busyTarget, error, linked, pendingToken, connect };
}

export function PlaidScript() {
  return <Script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js" strategy="afterInteractive" />;
}

export function BrokerageConnectButtons({
  connect,
  busy,
  busyTarget,
}: {
  connect: (target: LinkTarget) => Promise<void>;
  busy: boolean;
  busyTarget: LinkTarget | null;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {BROKER_TARGETS.map((id) => {
        const meta = BROKER_SEARCH[id];
        const thisBusy = busy && busyTarget === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => connect(id)}
            disabled={busy}
            className="bg-series-1 hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-4 py-3 transition-opacity text-left"
          >
            <div>{thisBusy ? "Opening Plaid Link…" : `Connect ${meta.displayName}`}</div>
            <div className="text-xs text-white/70 font-normal mt-0.5">Holdings via Investments</div>
          </button>
        );
      })}
    </div>
  );
}
