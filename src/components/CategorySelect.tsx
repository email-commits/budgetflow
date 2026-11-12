"use client";

import { CategoryKind, groupCategories } from "@/lib/categories";
import { useCategories } from "./DataProvider";

/** Grouped category dropdown, fed by the live category list (defaults + your own). */
export default function CategorySelect({
  value,
  onChange,
  placeholder,
  kinds,
  budgetable,
  exclude,
  className,
}: {
  value: string;
  onChange: (name: string) => void;
  /** first option with an empty value, e.g. "All categories" */
  placeholder?: string;
  kinds?: CategoryKind[];
  /** only categories that can carry a budget (spending, not excluded) */
  budgetable?: boolean;
  /** names to leave out (e.g. already budgeted) */
  exclude?: string[];
  className?: string;
}) {
  const categories = useCategories();
  const groups = groupCategories(categories, { kinds, budgetable });
  // keep the current value selectable even if it has since been hidden
  const known = groups.some((g) => g.items.some((c) => c.name === value));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {value && !known && <option value={value}>{value}</option>}
      {groups.map((g) => {
        const items = g.items.filter((c) => !exclude?.includes(c.name));
        if (items.length === 0) return null;
        return (
          <optgroup key={g.group} label={g.group}>
            {items.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
