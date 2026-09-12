// Where For You gets its candidate papers, and their similarity scores.
//
// Two sources, chosen at load time:
//
//   store   The paper store filled by the nightly job (Supabase, table
//           papers). The reader's content profile is the weighted average of
//           the embeddings of papers they responded to; the database returns
//           the nearest papers by cosine similarity. Recent papers on the
//           reader's top topics are added so a new reader with only interests
//           gets candidates too. arXiv is not called at all on this path.
//
//   live    No store (no Supabase, or the job has not run yet): the pool is
//           the newest papers from the reader's fields, fetched through the
//           API route as before, and similarity comes from the TF-IDF engine
//           (or the neural service when configured) against the saved papers.
//
// Both return the same shape, so the ranking blend (rank.ts) does not care
// which one answered.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paper } from "@/lib/arxiv";
import type { Candidate } from "@/lib/foryou/rank";
import {
  fetchEmbeddings,
  nearestPapers,
  recentPapers,
  recentPapersByTags,
  storeHasPapers,
  storeRowToPaper,
  type StoreRow,
} from "@/lib/foryou/remote";

export type CandidateSource = "store" | "live";

const NEAREST_N = 60;
const BY_TOPIC_N = 40;
const RECENT_N = 60;

// Asked once per page load; the answer does not change while the tab is open.
let storeCheck: Promise<boolean> | null = null;
export function storeAvailable(supabase: SupabaseClient | null): Promise<boolean> {
  if (!supabase) return Promise.resolve(false);
  storeCheck ??= storeHasPapers(supabase).catch(() => false);
  return storeCheck;
}

/** For tests: forget the cached answer. */
export function resetStoreCheck() {
  storeCheck = null;
}

/**
 * Weighted average of unit vectors, normalised to unit length again. Null
 * when there is nothing to average.
 */
export function contentVector(vectors: { vec: number[]; weight: number }[]): number[] | null {
  const dims = vectors[0]?.vec.length ?? 0;
  if (dims === 0) return null;
  const sum = new Array<number>(dims).fill(0);
  for (const { vec, weight } of vectors) {
    if (vec.length !== dims || !(weight > 0)) continue;
    for (let i = 0; i < dims; i++) sum[i] += vec[i] * weight;
  }
  const norm = Math.sqrt(sum.reduce((acc, x) => acc + x * x, 0));
  if (norm === 0) return null;
  return sum.map((x) => x / norm);
}

/**
 * Candidates from the store. `positives` are papers the reader responded
 * to, strongest first (lib/foryou/profile.ts); `topics` are the profile's top
 * topic ids. Throws when the store cannot be read.
 */
export async function storeCandidates(
  supabase: SupabaseClient,
  opts: { positives: { id: string; weight: number }[]; topics: string[] },
): Promise<Candidate[]> {
  const byId = new Map<string, Candidate>();
  const add = (rows: StoreRow[]) => {
    for (const r of rows) {
      const existing = byId.get(r.id);
      const similarity = r.similarity ?? 0;
      if (existing) existing.similarity = Math.max(existing.similarity, similarity);
      else byId.set(r.id, { paper: storeRowToPaper(r), similarity, popularity: r.popularity });
    }
  };

  // Nearest neighbours of the content profile, when there is one.
  const embeddings = await fetchEmbeddings(supabase, opts.positives.map((p) => p.id));
  const profileVec = contentVector(
    opts.positives.flatMap((p) => {
      const vec = embeddings.get(p.id);
      return vec ? [{ vec, weight: p.weight }] : [];
    }),
  );
  if (profileVec) add(await nearestPapers(supabase, profileVec, NEAREST_N));

  // Fresh papers on the reader's topics, so interests count before any reading.
  add(await recentPapersByTags(supabase, opts.topics.slice(0, 8), BY_TOPIC_N));

  // Nothing known about the reader yet: the newest papers, ranked by recency.
  if (byId.size === 0) add(await recentPapers(supabase, RECENT_N));

  return [...byId.values()];
}

/** Candidates from a live pool that the caller already ranked for similarity. */
export function liveCandidates(ranked: { paper: Paper; similarity: number }[]): Candidate[] {
  return ranked.map((r) => ({ paper: r.paper, similarity: r.similarity }));
}
