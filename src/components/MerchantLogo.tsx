"use client";

import { useMemo, useState } from "react";

/**
 * Merchant logo with graceful fallback chain:
 *   1. Plaid enrichment logo (logoUrl) when available
 *   2. Google favicon service by domain (no API key needed)
 *   3. Colored initial avatar (always works, offline-safe)
 *
 * For higher-fidelity logos, swap tier 2 for logo.dev with a free API key:
 *   `https://img.logo.dev/${domain}?token=YOUR_TOKEN&size=${size * 2}`
 */
export default function MerchantLogo({
  name,
  domain,
  logoUrl,
  size = 36,
}: {
  name: string;
  domain?: string;
  logoUrl?: string;
  size?: number;
}) {
  const sources = useMemo(() => {
    const list: string[] = [];
    if (logoUrl) list.push(logoUrl);
    if (domain) list.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
    return list;
  }, [logoUrl, domain, size]);

  const [idx, setIdx] = useState(0);

  if (idx < sources.length) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={sources[idx]}
        alt={name}
        width={size}
        height={size}
        className="rounded-full bg-white object-contain shrink-0"
        style={{ width: size, height: size }}
        onError={() => setIdx((i) => i + 1)}
        loading="lazy"
      />
    );
  }

  return <InitialAvatar name={name} size={size} />;
}

const AVATAR_COLORS = ["#3987e5", "#199e70", "#c98500", "#9085e9", "#e66767", "#d55181", "#d95926", "#008300"];

export function InitialAvatar({ name, size = 36 }: { name: string; size?: number }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold text-white shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
