// A small, dependency-free recommender.
//
// The architecture is the part that matters and stays the same even if you
// swap the vectorizer for neural embeddings later (see /recommender):
//   1. Turn each paper's text into a vector.
//   2. Build a "profile" vector = the average of the papers you saved.
//   3. Rank candidates by cosine similarity to the profile.
//   4. Blend in recency so recommendations don't get stale.
//
// Here the vectorizer is TF-IDF, which needs no model download and runs
// instantly. To upgrade, replace `vectorize` with calls to the embedding
// service and keep everything else.

import type { Paper } from "@/lib/arxiv";

type Vec = Map<string, number>;

const STOP = new Set(
  ("a an the of to in for on and or with we our this that is are be by from as " +
    "at it its these those can using use based via show present propose method " +
    "results paper approach model models data new toward towards into than then")
    .split(" "),
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

export const paperText = (p: Paper) => `${p.title} ${p.title} ${p.summary}`; // title weighted x2

// Inverse document frequency over a corpus, so common words count for less.
function buildIdf(docsTokens: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of docsTokens) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = docsTokens.length || 1;
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log((n + 1) / (d + 1)) + 1);
  return idf;
}

// L2-normalized TF-IDF vector.
function vectorize(tokens: string[], idf: Map<string, number>): Vec {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const vec: Vec = new Map();
  let norm = 0;
  for (const [t, f] of tf) {
    const w = (f / tokens.length) * (idf.get(t) ?? Math.log(2));
    vec.set(t, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [t, w] of vec) vec.set(t, w / norm);
  return vec;
}

function cosine(a: Vec, b: Vec): number {
  // Both are L2-normalized, so cosine is just the dot product.
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) dot += w * (big.get(t) ?? 0);
  return dot;
}

function centroid(vecs: Vec[]): Vec {
  const sum: Vec = new Map();
  for (const v of vecs) for (const [t, w] of v) sum.set(t, (sum.get(t) ?? 0) + w);
  let norm = 0;
  for (const w of sum.values()) norm += w * w;
  norm = Math.sqrt(norm) || 1;
  for (const [t, w] of sum) sum.set(t, w / norm);
  return sum;
}

export function recencyScore(iso: string, now = Date.now()): number {
  const days = (now - new Date(iso).getTime()) / 86_400_000;
  if (!isFinite(days)) return 0;
  return Math.exp(-days / 30); // ~1 today, decays over a month
}

export type Scored = { paper: Paper; score: number; similarity: number };

/**
 * Rank `candidates` for a user given the papers they `saved`.
 * Falls back to pure recency when there's nothing to learn from (cold start).
 */
export function recommend(
  saved: Paper[],
  candidates: Paper[],
  opts: { recencyWeight?: number } = {},
): Scored[] {
  const recencyWeight = opts.recencyWeight ?? 0.25;
  const savedIds = new Set(saved.map((p) => p.id));
  const pool = candidates.filter((p) => !savedIds.has(p.id));

  // Cold start: no signal yet, just show freshest first.
  if (saved.length === 0) {
    return pool
      .map((paper) => ({ paper, score: recencyScore(paper.published), similarity: 0 }))
      .sort((a, b) => b.score - a.score);
  }

  const corpus = [...saved, ...pool].map((p) => tokenize(paperText(p)));
  const idf = buildIdf(corpus);

  const profile = centroid(saved.map((p) => vectorize(tokenize(paperText(p)), idf)));

  return pool
    .map((paper) => {
      const sim = cosine(vectorize(tokenize(paperText(paper)), idf), profile);
      const score = (1 - recencyWeight) * sim + recencyWeight * recencyScore(paper.published);
      return { paper, score, similarity: sim };
    })
    .sort((a, b) => b.score - a.score);
}

/** Rank `candidates` by similarity to a single seed paper ("more like this"). */
export function similarTo(seed: Paper, candidates: Paper[]): Scored[] {
  const pool = candidates.filter((p) => p.id !== seed.id);
  const corpus = [seed, ...pool].map((p) => tokenize(paperText(p)));
  const idf = buildIdf(corpus);
  const seedVec = vectorize(tokenize(paperText(seed)), idf);
  return pool
    .map((paper) => {
      const similarity = cosine(vectorize(tokenize(paperText(paper)), idf), seedVec);
      return { paper, score: similarity, similarity };
    })
    .sort((a, b) => b.score - a.score);
}
