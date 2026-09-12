"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Paper } from "@/lib/arxiv";
import { useUser } from "@/lib/auth/useUser";
import {
  hiddenPaperIds,
  makeEvent,
  mergeEvents,
  trimEvents,
  withoutHide,
  type EventType,
  type ReadingEvent,
} from "@/lib/foryou/events";
import { clampBoost, positivePapers, seenCounts, topicProfile, type TopicProfile } from "@/lib/foryou/profile";
import { deleteAllRemoteEvents, deleteRemoteHide, fetchRemoteEvents, insertRemoteEvents } from "@/lib/foryou/remote";
import type { Profile } from "@/lib/profile";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// Reading history and the interest profile, for the feed.
//
// Same shape as saved papers (lib/useSaved.ts):
//   - the browser keeps the recent events in localStorage, so For You learns
//     for logged-out readers too and nothing leaves the device;
//   - signed in, events are queued for the account and flushed in order; the
//     queue survives a closed tab, so nothing is lost when offline;
//   - on the first login in a browser the local history is uploaded, then
//     the account's history and the local one are merged.
// Topic sliders live in the profile row when signed in, in localStorage
// otherwise.
//
// Events arrive in bursts (a scroll produces an impression and a dwell per
// card), so the account flush is delayed by a moment and sends one batch.

const KEY = "paperscroll_events";
const PENDING_KEY = "paperscroll_events_pending";
const MERGED_KEY = "paperscroll_events_merged_for"; // user id once merged in this browser
const BOOSTS_KEY = "paperscroll_topic_boosts";
const FLUSH_DELAY_MS = 1500;

type Pending = { op: "insert"; event: ReadingEvent } | { op: "unhide"; paperId: string } | { op: "clear" };

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}
const readLocal = () => trimEvents(readJson<ReadingEvent[]>(KEY, []));
const writeLocal = (list: ReadingEvent[]) => localStorage.setItem(KEY, JSON.stringify(trimEvents(list)));
const readPending = () => readJson<Pending[]>(PENDING_KEY, []);
const writePending = (list: Pending[]) => localStorage.setItem(PENDING_KEY, JSON.stringify(list));
const readLocalBoosts = () => readJson<Record<string, number>>(BOOSTS_KEY, {});

/** Forget the reading history in this browser. Used on sign-out. */
export function clearLocalReading() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(MERGED_KEY);
  localStorage.removeItem(PENDING_KEY);
}

// Applies the queue in order: inserts are batched into one request, an
// unhide or clear is sent on its own. Stops at the first failure and leaves
// the rest queued. One flush at a time.
let flushing: Promise<void> = Promise.resolve();
function flushPending(userId: string): Promise<void> {
  flushing = flushing.then(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let queue = readPending();
    while (queue.length > 0) {
      let batch: ReadingEvent[] = [];
      while (queue.length > 0 && queue[0].op === "insert" && batch.length < 100) {
        batch.push((queue.shift() as { op: "insert"; event: ReadingEvent }).event);
      }
      try {
        if (batch.length > 0) {
          await insertRemoteEvents(supabase, userId, batch);
        } else {
          const next = queue.shift()!;
          if (next.op === "unhide") await deleteRemoteHide(supabase, userId, next.paperId);
          else if (next.op === "clear") await deleteAllRemoteEvents(supabase, userId);
        }
      } catch (err) {
        console.warn("Reading history: could not reach the account, will retry.", err);
        // Put back what was taken.
        const taken: Pending[] = batch.length > 0 ? batch.map((event) => ({ op: "insert", event })) : [];
        writePending([...taken, ...queue]);
        return;
      }
      writePending(queue);
    }
  });
  return flushing;
}

export type Reading = {
  events: ReadingEvent[];
  profile: TopicProfile;
  /** Papers marked not interested. */
  hidden: Set<string>;
  /** Papers the reader responded to, strongest first. */
  positives: { id: string; weight: number }[];
  /** Recent impressions per paper. */
  seen: Map<string, number>;
  boosts: Record<string, number>;
  log: (type: EventType, paper: Paper, value?: number | null) => void;
  unhide: (paperId: string) => void;
  setBoost: (topicId: string, value: number) => void;
  resetBoosts: () => void;
  clearHistory: () => Promise<void>;
  signedIn: boolean;
};

export function useReading(opts: {
  /** The signed-in profile row, when the caller has it (interests and sliders). */
  account?: Profile | null;
  /** Saves part of the profile row; used for the sliders when signed in. */
  updateAccount?: (patch: Partial<Omit<Profile, "id">>) => Promise<unknown>;
} = {}): Reading {
  const { user } = useUser();
  const userId = user?.id ?? null;
  const [events, setEvents] = useState<ReadingEvent[]>([]);
  const [localBoosts, setLocalBoosts] = useState<Record<string, number>>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the browser copy once, and keep several tabs in step.
  useEffect(() => {
    setEvents(readLocal());
    setLocalBoosts(readLocalBoosts());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setEvents(readLocal());
      if (e.key === BOOSTS_KEY) setLocalBoosts(readLocalBoosts());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Signed in: upload the local history the first time, then merge with the account's.
  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const firstTimeHere = localStorage.getItem(MERGED_KEY) !== userId;
        if (firstTimeHere) {
          const local = readLocal();
          if (local.length > 0) writePending([...local.map((event): Pending => ({ op: "insert", event })), ...readPending()]);
        }
        await flushPending(userId);
        const remote = await fetchRemoteEvents(supabase, userId);
        if (cancelled) return;
        const merged = mergeEvents(remote, readLocal());
        writeLocal(merged);
        setEvents(trimEvents(merged));
        localStorage.setItem(MERGED_KEY, userId);
      } catch (err) {
        console.warn("Reading history: could not sync with the account.", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Queue a change for the account and flush after a short pause.
  const queueRemote = useCallback(
    (change: Pending) => {
      if (!userId) return;
      writePending([...readPending(), change]);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => void flushPending(userId), FLUSH_DELAY_MS);
    },
    [userId],
  );

  // Send whatever is queued when the tab goes to the background.
  useEffect(() => {
    if (!userId) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushPending(userId);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [userId]);

  const log = useCallback(
    (type: EventType, paper: Paper, value: number | null = null) => {
      const event = makeEvent(type, paper, value);
      setEvents((prev) => {
        const next = trimEvents([event, ...prev]);
        writeLocal(next);
        return next;
      });
      queueRemote({ op: "insert", event });
    },
    [queueRemote],
  );

  const unhide = useCallback(
    (paperId: string) => {
      setEvents((prev) => {
        const next = withoutHide(prev, paperId);
        writeLocal(next);
        return next;
      });
      queueRemote({ op: "unhide", paperId });
    },
    [queueRemote],
  );

  const clearHistory = useCallback(async () => {
    setEvents([]);
    writeLocal([]);
    if (userId) {
      writePending([{ op: "clear" }]); // drops queued inserts too
      await flushPending(userId);
    }
  }, [userId]);

  // Sliders: the account when signed in and the row is loaded, else the browser.
  const account = opts.account ?? null;
  const boosts = useMemo(() => {
    const raw = userId && account ? account.topic_boosts ?? {} : localBoosts;
    const out: Record<string, number> = {};
    for (const [t, v] of Object.entries(raw)) out[t] = clampBoost(v);
    return out;
  }, [userId, account, localBoosts]);

  const setBoost = useCallback(
    (topicId: string, value: number) => {
      const next = { ...boosts, [topicId]: clampBoost(value) };
      if (next[topicId] === 1) delete next[topicId];
      if (userId && account && opts.updateAccount) {
        void opts.updateAccount({ topic_boosts: next }).catch((err) => console.warn("Could not save the slider.", err));
      } else {
        localStorage.setItem(BOOSTS_KEY, JSON.stringify(next));
        setLocalBoosts(next);
      }
    },
    [boosts, userId, account, opts],
  );

  const resetBoosts = useCallback(() => {
    if (userId && account && opts.updateAccount) {
      void opts.updateAccount({ topic_boosts: {} }).catch((err) => console.warn("Could not reset the sliders.", err));
    } else {
      localStorage.removeItem(BOOSTS_KEY);
      setLocalBoosts({});
    }
  }, [userId, account, opts]);

  // A new array each render would rebuild the profile every time.
  const interests = useMemo(() => account?.interests ?? [], [account]);
  const profile = useMemo(() => topicProfile({ events, interests, boosts }), [events, interests, boosts]);
  const hidden = useMemo(() => hiddenPaperIds(events), [events]);
  const positives = useMemo(() => positivePapers(events), [events]);
  const seen = useMemo(() => seenCounts(events), [events]);

  return {
    events,
    profile,
    hidden,
    positives,
    seen,
    boosts,
    log,
    unhide,
    setBoost,
    resetBoosts,
    clearHistory,
    signedIn: userId !== null,
  };
}
