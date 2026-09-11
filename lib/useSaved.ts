"use client";

import { useCallback, useEffect, useState } from "react";
import type { Paper } from "@/lib/arxiv";

const KEY = "paperscroll_saved";

export type SavedPaper = Paper & { savedAt: string };

function read(): SavedPaper[] {
  if (typeof window === "undefined") return [];
  try {
    const list: Partial<SavedPaper>[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    // Papers saved before categories and tags existed get empty lists.
    return list.map((p) => ({ ...p, categories: p.categories ?? [], tags: p.tags ?? [] }) as SavedPaper);
  } catch {
    return [];
  }
}

export function useSaved() {
  const [saved, setSaved] = useState<SavedPaper[]>([]);

  // Load once on mount, and keep multiple tabs in sync.
  useEffect(() => {
    setSaved(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setSaved(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: SavedPaper[]) => {
    setSaved(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }, []);

  const isSaved = useCallback(
    (id: string) => saved.some((p) => p.id === id),
    [saved],
  );

  const toggle = useCallback(
    (paper: Paper) => {
      const exists = saved.some((p) => p.id === paper.id);
      persist(
        exists
          ? saved.filter((p) => p.id !== paper.id)
          : [{ ...paper, savedAt: new Date().toISOString() }, ...saved],
      );
    },
    [saved, persist],
  );

  const remove = useCallback(
    (id: string) => persist(saved.filter((p) => p.id !== id)),
    [saved, persist],
  );

  return { saved, isSaved, toggle, remove };
}
