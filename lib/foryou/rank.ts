// The For You ranking blend.
//
// Every candidate paper gets a score from five parts, each between 0 and 1
// (topic affinity can go negative):
//   similarity   how close the paper is to the papers the reader responded
//                to (cosine to the content profile: sentence embeddings when
//                the paper store is available, TF-IDF otherwise)
//   topic        how well its topic tags match the interest profile
//   recency      1 today, fading over a month
//   popularity   saves and reads by all readers, computed by the nightly job
//   novelty      a multiplier that lowers papers the reader has already seen
// The weights below say how much each part counts. They were set by hand and
// checked with scripts/foryou-eval.ts, which prints precision at 10 for each
// part on its own and for the blend.
//
// After scoring, the list is built one slot at a time:
//   - diversity: a candidate is penalised a little for every already-picked
//     paper that shares its first topic, so one theme cannot fill the screen;
//   - exploration: every EXPLORE_EVERY-th slot goes to a good paper from
//     outside the reader's top topics, so the feed keeps showing things the
//     profile would not have chosen. Those cards say "Something different".
//
// Each result carries a reason, the part that contributed most, which the
// card shows as "why you are seeing this". The function is pure: the clock
// and the random source are inputs, so tests are deterministic.

import type { Paper } from "@/lib/arxiv";
import { affinity, bestTopic, type TopicProfile } from "@/lib/foryou/profile";
import { recencyScore } from "@/lib/recommender";
import { topicById } from "@/lib/topics";

export type Candidate = {
  paper: Paper;
  /** 0 to 1; 0 when there is no content profile yet. */
  similarity: number;
  /** 0 to 1 from the nightly job; missing for live arXiv candidates. */
  popularity?: number;
};

export type ReasonKind = "similar" | "topic" | "interest" | "fresh" | "popular" | "explore";
export type Reason = { kind: ReasonKind; topicId?: string };

export type Parts = { similarity: number; topic: number; recency: number; popularity: number; novelty: number };

export type RankedPaper = {
  paper: Paper;
  score: number;
  parts: Parts;
  reason: Reason;
};

export const WEIGHTS = { similarity: 0.45, topic: 0.3, recency: 0.15, popularity: 0.1 };
export const DIVERSITY_PENALTY = 0.06;
export const EXPLORE_EVERY = 6;
/** Exploration picks are drawn from this many of the best outside candidates. */
const EXPLORE_POOL = 5;
/** How many top topics count as "inside" the reader's taste for exploration. */
const INSIDE_TOPICS = 5;

export type RankContext = {
  profile: TopicProfile;
  /** Papers marked not interested: never shown. */
  hidden?: Set<string>;
  /** Papers to leave out for other reasons (already saved). */
  exclude?: Set<string>;
  /** Impressions per paper in the recent past, for novelty. */
  seen?: Map<string, number>;
  now?: number;
  random?: () => number;
  /** Set to skip the exploration slots (used by the evaluation harness). */
  explore?: boolean;
};

export function rankForYou(candidates: Candidate[], ctx: RankContext): RankedPaper[] {
  const now = ctx.now ?? Date.now();
  const random = ctx.random ?? Math.random;
  const explore = ctx.explore ?? true;

  // 1. Score every candidate independently.
  const scored: RankedPaper[] = [];
  const ids = new Set<string>();
  for (const c of candidates) {
    const id = c.paper.id;
    if (ids.has(id) || ctx.hidden?.has(id) || ctx.exclude?.has(id)) continue;
    ids.add(id);

    const seen = ctx.seen?.get(id) ?? 0;
    const parts: Parts = {
      similarity: clamp01(c.similarity),
      topic: affinity(ctx.profile, c.paper.tags ?? []),
      recency: recencyScore(c.paper.published, now),
      popularity: clamp01(c.popularity ?? 0),
      novelty: 1 / (1 + 0.5 * seen),
    };
    const score =
      (WEIGHTS.similarity * parts.similarity +
        WEIGHTS.topic * parts.topic +
        WEIGHTS.recency * parts.recency +
        WEIGHTS.popularity * parts.popularity) *
      parts.novelty;
    scored.push({ paper: c.paper, score, parts, reason: pickReason(parts, ctx.profile, c.paper.tags ?? []) });
  }
  scored.sort((a, b) => b.score - a.score);

  // 2. Build the list slot by slot with diversity and exploration.
  const inside = new Set(ctx.profile.top.slice(0, INSIDE_TOPICS).map((t) => t.id));
  const isOutside = (p: RankedPaper) =>
    (p.paper.tags ?? []).length > 0 && !(p.paper.tags ?? []).some((t) => inside.has(t));

  const remaining = [...scored];
  const out: RankedPaper[] = [];
  const topicCounts = new Map<string, number>();

  while (remaining.length > 0) {
    const slot = out.length + 1;
    let pickIndex = -1;

    if (explore && inside.size > 0 && slot % EXPLORE_EVERY === 0) {
      // Exploration slot: one of the best candidates from outside the top topics.
      const outside: number[] = [];
      for (let i = 0; i < remaining.length && outside.length < EXPLORE_POOL; i++) {
        if (isOutside(remaining[i])) outside.push(i);
      }
      if (outside.length > 0) {
        pickIndex = outside[Math.min(outside.length - 1, Math.floor(random() * outside.length))];
        remaining[pickIndex] = { ...remaining[pickIndex], reason: { kind: "explore" } };
      }
    }

    if (pickIndex < 0) {
      // Regular slot: best score after the diversity penalty.
      let best = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const first = remaining[i].paper.tags?.[0];
        const penalty = first ? DIVERSITY_PENALTY * Math.min(3, topicCounts.get(first) ?? 0) : 0;
        const s = remaining[i].score - penalty;
        if (s > best) {
          best = s;
          pickIndex = i;
        }
      }
    }

    const [picked] = remaining.splice(pickIndex, 1);
    const first = picked.paper.tags?.[0];
    if (first) topicCounts.set(first, (topicCounts.get(first) ?? 0) + 1);
    out.push(picked);
  }
  return out;
}

function pickReason(parts: Parts, profile: TopicProfile, tags: string[]): Reason {
  const contributions: [ReasonKind, number][] = [
    ["similar", WEIGHTS.similarity * parts.similarity],
    ["topic", WEIGHTS.topic * parts.topic],
    ["fresh", WEIGHTS.recency * parts.recency],
    ["popular", WEIGHTS.popularity * parts.popularity],
  ];
  contributions.sort((a, b) => b[1] - a[1]);
  const [kind, value] = contributions[0];
  if (value <= 0) return { kind: "fresh" };
  if (kind === "topic") {
    const topicId = bestTopic(profile, tags) ?? undefined;
    const fromInterests = topicId !== undefined && profile.fromInterests.has(topicId);
    return { kind: fromInterests ? "interest" : "topic", topicId };
  }
  return { kind };
}

/** The one-line explanation shown on the card. */
export function reasonText(reason: Reason): string {
  const label = reason.topicId ? topicById(reason.topicId)?.label : undefined;
  switch (reason.kind) {
    case "similar":
      return "Close to papers you responded to";
    case "topic":
      return label ? `Because you read about ${label}` : "Matches what you read";
    case "interest":
      return label ? `Matches your interest in ${label}` : "Matches your interests";
    case "fresh":
      return "New this week";
    case "popular":
      return "Popular with other readers";
    case "explore":
      return "Something different";
  }
}

const clamp01 = (n: number) => (isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
