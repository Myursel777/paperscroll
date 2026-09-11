"use client";

import { useCallback, useEffect, useState } from "react";
import type { Paper } from "@/lib/arxiv";
import { useUser } from "@/lib/auth/useUser";
import { mergeSaved, normaliseSaved, type SavedPaper } from "@/lib/saved/merge";
import { deleteRemoteSaved, fetchRemoteSaved, setRemoteCollection, upsertRemoteSaved } from "@/lib/saved/remote";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export type { SavedPaper } from "@/lib/saved/merge";

// Saved papers.
//
// The browser always keeps its own list in localStorage, so saving works
// logged out and offline. When a user is signed in the account is the shared
// copy:
//   - On the first login in this browser the two lists are merged (nothing is
//     lost either way) and browser-only papers are uploaded. After that the
//     account leads and the browser mirrors it, so a removal made on another
//     device shows up here.
//   - Every save or removal is applied locally at once and queued for the
//     account. The queue lives in localStorage too, so a write that fails
//     (offline, service down) is retried on the next sync instead of lost.

const KEY = "paperscroll_saved";
const MERGED_KEY = "paperscroll_saved_merged_for"; // user id once merged in this browser
const PENDING_KEY = "paperscroll_saved_pending";

type Pending = { op: "upsert"; paper: SavedPaper } | { op: "delete"; id: string };

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

function readLocal(): SavedPaper[] {
  const list = readJson<Partial<SavedPaper>[]>(KEY, []);
  // Papers saved before categories and tags existed get empty lists.
  return normaliseSaved(list.map((p) => ({ ...p, categories: p.categories ?? [], tags: p.tags ?? [] }) as SavedPaper));
}

const writeLocal = (list: SavedPaper[]) => localStorage.setItem(KEY, JSON.stringify(list));
const readPending = () => readJson<Pending[]>(PENDING_KEY, []);
const writePending = (list: Pending[]) => localStorage.setItem(PENDING_KEY, JSON.stringify(list));

/** Forget everything about saves in this browser. Used on sign-out. */
export function clearLocalSaved() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(MERGED_KEY);
  localStorage.removeItem(PENDING_KEY);
}

// Applies queued writes in order and stops at the first failure, leaving the
// rest queued. One flush at a time so concurrent saves do not race.
let flushing: Promise<void> = Promise.resolve();
function flushPending(userId: string): Promise<void> {
  flushing = flushing.then(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let queue = readPending();
    while (queue.length > 0) {
      const [next, ...rest] = queue;
      try {
        if (next.op === "upsert") await upsertRemoteSaved(supabase, userId, [next.paper]);
        else await deleteRemoteSaved(supabase, userId, next.id);
      } catch (err) {
        console.warn("Saved papers: could not reach the account, will retry.", err);
        return;
      }
      queue = rest;
      writePending(queue);
    }
  });
  return flushing;
}

export function useSaved() {
  const { user } = useUser();
  const userId = user?.id ?? null;
  const [saved, setSaved] = useState<SavedPaper[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Load the browser copy once, and keep several tabs in step.
  useEffect(() => {
    setSaved(readLocal());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setSaved(readLocal());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // When a user is signed in, bring the browser and the account together.
  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;

    (async () => {
      setSyncing(true);
      try {
        await flushPending(userId);
        const remote = await fetchRemoteSaved(supabase, userId);
        const firstTimeHere = localStorage.getItem(MERGED_KEY) !== userId;
        const { merged, toUpload } = firstTimeHere ? mergeSaved(readLocal(), remote) : { merged: remote, toUpload: [] };
        if (cancelled) return;
        writeLocal(merged);
        setSaved(merged);
        if (toUpload.length > 0) await upsertRemoteSaved(supabase, userId, toUpload);
        localStorage.setItem(MERGED_KEY, userId);
      } catch (err) {
        console.warn("Saved papers: could not sync with the account.", err);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    (next: SavedPaper[], change: Pending | null) => {
      setSaved(next);
      writeLocal(next);
      if (change && userId) {
        writePending([...readPending(), change]);
        void flushPending(userId);
      }
    },
    [userId],
  );

  const isSaved = useCallback((id: string) => saved.some((p) => p.id === id), [saved]);

  const toggle = useCallback(
    (paper: Paper) => {
      const exists = saved.some((p) => p.id === paper.id);
      if (exists) {
        persist(saved.filter((p) => p.id !== paper.id), { op: "delete", id: paper.id });
      } else {
        const entry: SavedPaper = { ...paper, savedAt: new Date().toISOString() };
        persist([entry, ...saved], { op: "upsert", paper: entry });
      }
    },
    [saved, persist],
  );

  const remove = useCallback(
    (id: string) => persist(saved.filter((p) => p.id !== id), { op: "delete", id }),
    [saved, persist],
  );

  /** File a saved paper under a collection (or none). Signed-in only; written straight through. */
  const setCollection = useCallback(
    async (paperId: string, collectionId: string | null) => {
      const next = saved.map((p) => (p.id === paperId ? { ...p, collectionId } : p));
      setSaved(next);
      writeLocal(next);
      const supabase = getSupabaseBrowser();
      if (supabase && userId) await setRemoteCollection(supabase, userId, paperId, collectionId);
    },
    [saved, userId],
  );

  return { saved, isSaved, toggle, remove, setCollection, syncing, signedIn: userId !== null };
}
