// The interest profile: one weight per topic, learned from reading events.
//
// Each event adds its weight to every topic the paper was tagged with. A save
// counts for more than an expand, an expand for more than a long look, and
// "not interested" counts against. Weights fade with a 30-day half-life, so
// what you read this week matters twice as much as what you read a month
// ago, and a phase of reading about one thing does not follow you for ever.
//
// Two more inputs shape the profile:
//   - interests picked at onboarding (or in Settings) act as a prior: a fixed
//     weight that does not fade, so For You has somewhere to start before any
//     reading has happened;
//   - topic sliders ("boosts", 0 to 2, 1 is neutral) let the reader turn a
//     topic up or down directly: the weight is multiplied, and a slider away
//     from neutral adds or removes one prior's worth, so turning up a topic
//     with no history still has an effect.
//
// Everything here is pure and runs in the browser in well under a
// millisecond for a few hundred events. Signed-in or not makes no difference;
// only where the events come from differs (see useReading.ts).

import type { EventType, ReadingEvent } from "@/lib/foryou/events";

export const HALF_LIFE_DAYS = 30;
export const INTEREST_PRIOR = 1.5;

/** Weight per event type. Dwell is scaled by how long the card was seen (see dwellWeight). */
export const EVENT_WEIGHTS: Record<EventType, number> = {
  impression: 0, // seeing a card says nothing about liking it
  dwell: 1, // at most; scaled by duration
  expand: 1,
  read: 2,
  save: 3,
  unsave: -2,
  not_interested: -3,
  tag_tap: 1.5,
};

/** Below this the reader was probably just scrolling past. */
export const MIN_DWELL_S = 2;
/** Dwell reaches its full weight here. */
export const FULL_DWELL_S = 30;

const DAY_MS = 86_400_000;

/** 1 for something that happened now, 0.5 after HALF_LIFE_DAYS, 0.25 after twice that. */
export function decay(ageMs: number): number {
  if (!(ageMs > 0)) return 1;
  return Math.pow(0.5, ageMs / (HALF_LIFE_DAYS * DAY_MS));
}

/** 0 for a glance, rising to 1 at FULL_DWELL_S. */
export function dwellWeight(ms: number | null): number {
  const s = (ms ?? 0) / 1000;
  if (s <= MIN_DWELL_S) return 0;
  return Math.min(1, (s - MIN_DWELL_S) / (FULL_DWELL_S - MIN_DWELL_S));
}

/** The weight of one event before time decay. */
export function eventWeight(e: ReadingEvent): number {
  if (e.type === "dwell") return EVENT_WEIGHTS.dwell * dwellWeight(e.value);
  return EVENT_WEIGHTS[e.type] ?? 0;
}

export type TopicWeight = { id: string; weight: number };

export type TopicProfile = {
  /** Raw weight per topic id; can be negative. */
  weights: Record<string, number>;
  /** Topics with a positive weight, strongest first. */
  top: TopicWeight[];
  /** Number of events that carried any weight; 0 means the profile is only priors. */
  evidence: number;
  /** Topic ids that come from interests only, with no reading behind them yet. */
  fromInterests: Set<string>;
};

export type ProfileInput = {
  events: ReadingEvent[];
  /** Topic ids from onboarding or Settings. */
  interests?: string[];
  /** Slider values per topic id, 0 to 2; missing means 1. */
  boosts?: Record<string, number>;
  now?: number;
};

export function topicProfile({ events, interests = [], boosts = {}, now = Date.now() }: ProfileInput): TopicProfile {
  const weights: Record<string, number> = {};
  const evidenced = new Set<string>();
  let evidence = 0;

  for (const e of events) {
    const w = eventWeight(e);
    if (w === 0 || e.tags.length === 0) continue;
    evidence += 1;
    const d = decay(now - new Date(e.at).getTime());
    for (const t of e.tags) {
      weights[t] = (weights[t] ?? 0) + w * d;
      evidenced.add(t);
    }
  }

  for (const t of interests) weights[t] = (weights[t] ?? 0) + INTEREST_PRIOR;

  for (const [t, raw] of Object.entries(boosts)) {
    const b = clampBoost(raw);
    if (b === 1) continue;
    weights[t] = (weights[t] ?? 0) * b + (b - 1) * INTEREST_PRIOR;
  }

  const top = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .map(([id, weight]) => ({ id, weight }))
    .sort((a, b) => b.weight - a.weight);

  const fromInterests = new Set(interests.filter((t) => !evidenced.has(t)));
  return { weights, top, evidence, fromInterests };
}

export function clampBoost(v: unknown): number {
  const n = typeof v === "number" && isFinite(v) ? v : 1;
  return Math.min(2, Math.max(0, n));
}

/**
 * How well a paper's tags match the profile, from -1 (everything it is about
 * is turned down) to 1 (its topics are the reader's strongest). Untagged
 * papers score 0: the profile knows nothing about them either way.
 */
export function affinity(profile: TopicProfile, tags: string[]): number {
  if (tags.length === 0) return 0;
  const scale = Math.max(...Object.values(profile.weights).map(Math.abs), 0);
  if (scale === 0) return 0;
  let sum = 0;
  for (const t of tags) sum += (profile.weights[t] ?? 0) / scale;
  return sum / tags.length;
}

/** The profile topic a paper's tags match best, for "because you read about X". */
export function bestTopic(profile: TopicProfile, tags: string[]): string | null {
  let best: string | null = null;
  let bestW = 0;
  for (const t of tags) {
    const w = profile.weights[t] ?? 0;
    if (w > bestW) {
      best = t;
      bestW = w;
    }
  }
  return best;
}

/**
 * Papers the reader responded to, with a decayed positive weight each,
 * strongest first. This is the seed for the content profile (the average
 * embedding, or the TF-IDF centroid) in the ranking step.
 */
export function positivePapers(events: ReadingEvent[], now = Date.now(), limit = 30): { id: string; weight: number }[] {
  const byPaper = new Map<string, number>();
  for (const e of events) {
    const w = eventWeight(e);
    if (w === 0) continue;
    const d = decay(now - new Date(e.at).getTime());
    byPaper.set(e.paperId, (byPaper.get(e.paperId) ?? 0) + w * d);
  }
  return [...byPaper.entries()]
    .filter(([, w]) => w > 0)
    .map(([id, weight]) => ({ id, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/** How many times each paper has been shown in the last `days`, for the novelty term. */
export function seenCounts(events: ReadingEvent[], now = Date.now(), days = 14): Map<string, number> {
  const cutoff = new Date(now - days * DAY_MS).toISOString();
  const out = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "impression" || e.at < cutoff) continue;
    out.set(e.paperId, (out.get(e.paperId) ?? 0) + 1);
  }
  return out;
}
