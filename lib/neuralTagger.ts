// Client for the embedding tagger (tagger v2) in /recommender, used on the
// server by the API route.
//
// Same contract as the rule-based tagger: papers in, up to MAX_TAGS topic ids
// per paper out. The difference is that the service compares the meaning of
// each abstract with each topic description, so a paper about "score-based
// generative modelling" can be tagged "Generative models" without the word
// "diffusion" appearing.
//
// Behaviour:
//   - Not configured (no RECOMMENDER_URL) or not reachable within the timeout:
//     returns null and the caller falls back to the rules. Readers never see
//     the difference beyond tag quality.
//   - Each paper is tagged once per server process and cached by id, so the
//     service is asked only about papers it has not seen.

import type { Paper } from "@/lib/arxiv";
import { paperText } from "@/lib/recommender";
import { MAX_TAGS, tagPapers } from "@/lib/tagger";
import { TOPICS } from "@/lib/topics";

const DEFAULT_TIMEOUT_MS = 4000;
const THRESHOLD = 0.3;

type Deps = {
  url?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (message: string) => void;
};

type Taggable = Pick<Paper, "id" | "title" | "summary"> & Partial<Pick<Paper, "categories" | "primaryCategory">>;

export function createNeuralTagger(deps: Deps = {}) {
  const base = deps.url?.replace(/\/$/, "");
  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = deps.log ?? ((m: string) => console.warn(m));
  const cache = new Map<string, string[]>();

  // The taxonomy as the service sees it: label plus description per topic.
  const topics = TOPICS.map((t) => ({ id: t.id, text: `${t.label}. ${t.description}` }));

  /** Tags for the given papers from the service, or null if it cannot be used. */
  async function tagNeural(papers: Taggable[]): Promise<Map<string, string[]> | null> {
    if (!base) return null;

    const result = new Map<string, string[]>();
    const todo = papers.filter((p) => {
      const hit = cache.get(p.id);
      if (hit) result.set(p.id, hit);
      return !hit;
    });
    if (todo.length === 0) return result;

    try {
      const res = await doFetch(`${base}/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          topics,
          candidates: todo.map((p) => ({ id: p.id, text: paperText(p as Paper) })),
          threshold: THRESHOLD,
          max_tags: MAX_TAGS,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const tagged: { id: string; tags: { id: string; similarity: number }[] }[] = await res.json();
      for (const t of tagged) {
        const ids = t.tags.map((s) => s.id).slice(0, MAX_TAGS);
        cache.set(t.id, ids);
        result.set(t.id, ids);
      }
      return result;
    } catch (err) {
      log(`Neural tagger unavailable, using the rule-based tagger. ${(err as Error)?.message ?? err}`);
      return null;
    }
  }

  /**
   * Papers with `tags` filled in: from the service when it answers, from the
   * rules otherwise. Papers the service returned nothing for also fall back
   * to the rules, so a paper is never left untagged for lack of a model.
   */
  async function tagPapersBest<T extends Taggable>(papers: T[]): Promise<(T & { tags: string[] })[]> {
    const neural = await tagNeural(papers);
    const byRules = tagPapers(papers);
    if (!neural) return byRules;
    return byRules.map((p) => {
      const n = neural.get(p.id);
      return n && n.length > 0 ? { ...p, tags: n } : p;
    });
  }

  return { tagNeural, tagPapersBest };
}

/** Server-side default. RECOMMENDER_URL is preferred; the public variable also works. */
export const neuralTagger = createNeuralTagger({
  url: process.env.RECOMMENDER_URL ?? process.env.NEXT_PUBLIC_RECOMMENDER_URL,
});
