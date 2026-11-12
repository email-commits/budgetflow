"use client";

import { useState } from "react";
import { CategoryDef, defaultGroupColor, groupCategories } from "@/lib/categories";

const NEW_GROUP = "__new__";

/** Settings card: browse the category list, add your own, hide / exclude / recolour. */
export default function CategoriesCard({
  categories,
  onChanged,
}: {
  categories: CategoryDef[];
  onChanged: () => Promise<void>;
}) {
  const groups = groupCategories(categories, { includeHidden: true });
  const [name, setName] = useState("");
  const [group, setGroup] = useState(groups.find((g) => g.group === "Shopping")?.group ?? groups[0]?.group ?? "");
  const [newGroup, setNewGroup] = useState("");
  const [excluded, setExcluded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const call = async (method: string, body?: unknown, query = "") => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/categories${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error ?? "Failed");
      await onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const targetGroup = group === NEW_GROUP ? newGroup : group;
    const ok = await call("POST", { name, group: targetGroup, excluded });
    if (ok) {
      setName("");
      setExcluded(false);
      if (group === NEW_GROUP) {
        setGroup(targetGroup.trim());
        setNewGroup("");
      }
    }
  };

  const remove = async (c: CategoryDef) => {
    if (confirmDelete !== c.name) {
      setConfirmDelete(c.name);
      return;
    }
    setConfirmDelete(null);
    await call("DELETE", undefined, `?name=${encodeURIComponent(c.name)}`);
  };

  const saveRename = async (c: CategoryDef) => {
    if (await call("PATCH", { name: c.name, rename: renameTo })) setRenaming(null);
  };

  const custom = categories.filter((c) => c.custom).length;
  const targetGroup = group === NEW_GROUP ? newGroup : group;

  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="font-medium">Categories</h2>
        <p className="text-sm text-ink-muted mt-0.5">
          {categories.length} categories in {groups.length} groups{custom > 0 && ` · ${custom} of your own`}. Add your own,
          hide ones you don&apos;t use, or exclude a category from spending and budgets.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          maxLength={40}
          className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-52 outline-none focus:border-series-1 placeholder:text-ink-muted"
        />
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"
        >
          {groups.map((g) => (
            <option key={g.group} value={g.group}>
              {g.group}
            </option>
          ))}
          <option value={NEW_GROUP}>+ New group…</option>
        </select>
        {group === NEW_GROUP && (
          <input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder="Group name"
            maxLength={40}
            className="bg-surface2 border border-white/10 rounded-xl px-3 py-2 text-sm w-44 outline-none focus:border-series-1 placeholder:text-ink-muted"
          />
        )}
        <label className="flex items-center gap-2 text-sm text-ink-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={excluded}
            onChange={(e) => setExcluded(e.target.checked)}
            className="accent-[#3987e5]"
          />
          Exclude from spending
        </label>
        <button
          onClick={add}
          disabled={busy || name.trim().length < 2 || targetGroup.trim().length < 2}
          className="bg-series-1 text-white text-sm rounded-xl px-4 py-2 disabled:opacity-40"
        >
          Add category
        </button>
      </div>
      {error && <p className="text-sm text-critical">{error}</p>}

      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.group}>
            <div className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: g.items[0]?.color ?? defaultGroupColor(g.group) }} />
              {g.group}
            </div>
            <div className="space-y-0.5">
              {g.items.map((c) => (
                <div
                  key={c.name}
                  className={`group flex items-center gap-2 text-sm rounded-lg px-2 py-1 hover:bg-surface2 ${
                    c.hidden ? "opacity-45" : ""
                  }`}
                >
                  <input
                    type="color"
                    value={c.color}
                    disabled={busy}
                    onChange={(e) => call("PATCH", { name: c.name, color: e.target.value })}
                    title="Change colour"
                    className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer shrink-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                  />
                  {renaming === c.name ? (
                    <>
                      <input
                        autoFocus
                        value={renameTo}
                        onChange={(e) => setRenameTo(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveRename(c)}
                        maxLength={40}
                        className="flex-1 min-w-0 bg-surface border border-white/10 rounded-lg px-2 py-0.5 text-sm outline-none focus:border-series-1"
                      />
                      <button onClick={() => saveRename(c)} disabled={busy} className="text-xs text-series-1">
                        Save
                      </button>
                      <button onClick={() => setRenaming(null)} className="text-xs text-ink-muted">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 truncate">
                        {c.name}
                        {c.custom && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-series-1">yours</span>}
                        {c.excluded && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-muted">excluded</span>
                        )}
                        {c.hidden && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-muted">hidden</span>}
                      </span>
                      <span className="hidden group-hover:flex items-center gap-2.5 text-xs text-ink-muted shrink-0">
                        {c.kind !== "transfer" && (
                          <button
                            disabled={busy}
                            onClick={() => call("PATCH", { name: c.name, excluded: !c.excluded })}
                            className="hover:text-ink-primary"
                            title="Excluded categories are left out of spending, income and budgets"
                          >
                            {c.excluded ? "Include" : "Exclude"}
                          </button>
                        )}
                        {c.name !== "Uncategorized" && (
                          <button
                            disabled={busy}
                            onClick={() => call("PATCH", { name: c.name, hidden: !c.hidden })}
                            className="hover:text-ink-primary"
                            title="Hidden categories are not offered when categorizing"
                          >
                            {c.hidden ? "Show" : "Hide"}
                          </button>
                        )}
                        {c.custom && (
                          <>
                            <button
                              onClick={() => {
                                setRenaming(c.name);
                                setRenameTo(c.name);
                              }}
                              className="hover:text-ink-primary"
                            >
                              Rename
                            </button>
                            <button disabled={busy} onClick={() => remove(c)} className="hover:text-critical">
                              {confirmDelete === c.name ? "Really delete?" : "Delete"}
                            </button>
                          </>
                        )}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
