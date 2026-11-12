"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { CategoryDef, DEFAULT_CATEGORIES, registerCategories } from "@/lib/categories";
import { AppData } from "@/lib/types";

interface Ctx {
  data: AppData | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const DataContext = createContext<Ctx>({ data: null, loading: true, refresh: async () => {} });

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/data");
      const json: AppData = await resp.json();
      // colours, groups and "excluded" flags are looked up by name everywhere
      registerCategories(json.categories);
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return <DataContext.Provider value={{ data, loading, refresh }}>{children}</DataContext.Provider>;
}

export function useAppData() {
  return useContext(DataContext);
}

/** The live category list (defaults + custom). */
export function useCategories(): CategoryDef[] {
  return useContext(DataContext).data?.categories ?? DEFAULT_CATEGORIES;
}
