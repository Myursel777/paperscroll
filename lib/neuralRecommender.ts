// Client for the optional neural recommender in /recommender.
//
// Same contract as the local TF-IDF engine: the caller passes the papers to
// learn from and the candidates, and gets them back best-first. The only
// difference is that here the vectors come from a sentence-transformer served
// by the FastAPI app. Both functions return null when the service is not
// configured or not reachable, so the caller can fall back to the local
// engine without the user noticing.

import type { Paper } from "@/lib/arxiv";
import { paperText, recencyScore, type Scored } from "@/lib/recommender";

const BASE = process.env.NEXT_PUBLIC_RECOMMENDER_URL?.replace(/\/$/, "");
const TIMEOUT_MS = 4000;

/**
 * Rank `candidates` by similarity to `liked` (saved papers, or a single seed
 * for "more like this"). Returns null if the service cannot be used.
 */
export async function rankNeural(
  liked: Paper[],
  candidates: Paper[],
  opts: { recencyWeight?: number } = {},
): Promise<Scored[] | null> {
  if (!BASE) return null;

  const likedIds = new Set(liked.map((p) => p.id));
  const pool = candidates.filter((p) => !likedIds.has(p.id));
  const byId = new Map(pool.map((p) => [p.id, p]));

  try {
    const res = await fetch(`${BASE}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        liked: liked.map(paperText),
        candidates: pool.map((p) => ({
          id: p.id,
          text: paperText(p),
          recency: recencyScore(p.published),
        })),
        recency_weight: opts.recencyWeight ?? 0.25,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const ranked: { id: string; score: number; similarity: number }[] = await res.json();
    return ranked
      .filter((r) => byId.has(r.id))
      .map((r) => ({ paper: byId.get(r.id)!, score: r.score, similarity: r.similarity }));
  } catch (err) {
    console.warn("Neural recommender unavailable, using the local TF-IDF engine.", err);
    return null;
  }
}
