"use client";

import { createContext, useContext, useEffect, useState } from "react";
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
      setData(await resp.json());
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
