// Nightly job, step 1: fetch recent papers from arXiv and tag them.
//
//   npx tsx scripts/nightly/fetch.ts [out.json]
//
// This is the only place arXiv is called on a schedule. It walks every field
// in lib/arxiv.ts, asks for the newest PER_FIELD papers, and writes one JSON
// file. The arXiv client is the same one the app uses, so the three-second
// spacing, the cache, and the 429 backoff all apply: about a dozen requests,
// once a night, from one machine.
//
// Tagging: the embedding tagger when RECOMMENDER_URL is set and answers,
// the rule-based tagger otherwise (lib/neuralTagger.ts decides, exactly as
// the API route does). Doing it here means the tags are computed once for
// everyone instead of on every reader's request.
//
// Step 2 (recommender/embed.py) adds an embedding to each paper; step 3
// (upload.ts) writes them to Supabase.

import { writeFileSync } from "node:fs";
import { FIELDS, type Paper } from "../../lib/arxiv";
import { buildQueryUrl, createArxivClient } from "../../lib/arxivClient";
import { createNeuralTagger } from "../../lib/neuralTagger";

/** Papers per field per night. Six fields, so about 600 papers a night.
 *  NIGHTLY_PER_FIELD lowers it for a quick rehearsal against the fake. */
const PER_FIELD = Number(process.env.NIGHTLY_PER_FIELD ?? 100);
/** arXiv caps a single request; the job pages up to this. */
const PAGE = 50;

export type StoredPaper = Paper & { embedding?: number[] };
export type Store = { builtAt: string; papers: StoredPaper[] };

async function main() {
  const out = process.argv[2] ?? "papers.json";
  const client = createArxivClient({ log: (m) => console.log(m) });
  const tagger = createNeuralTagger({
    url: process.env.RECOMMENDER_URL ?? process.env.NEXT_PUBLIC_RECOMMENDER_URL,
    timeoutMs: 60_000, // a batch of a hundred abstracts, not a page request
    log: (m) => console.log(m),
  });

  const byId = new Map<string, Paper>();
  for (const field of FIELDS) {
    for (let start = 0; start < PER_FIELD; start += PAGE) {
      const url = buildQueryUrl({ cats: field.cats, start, max: Math.min(PAGE, PER_FIELD - start) });
      try {
        const { papers, stale } = await client.getPapers(url);
        console.log(`${field.id}: ${papers.length} papers from ${start}${stale ? " (cached)" : ""}`);
        for (const p of papers) byId.set(p.id, p);
        if (papers.length === 0) break;
      } catch (err) {
        // One field failing must not lose the whole night.
        console.error(`${field.id}: ${(err as Error).message}`);
        break;
      }
    }
  }

  const fetched = [...byId.values()];
  if (fetched.length === 0) {
    console.error("arXiv returned nothing; leaving the store untouched.");
    process.exit(1);
  }

  const tagged = await tagger.tagPapersBest(fetched);
  const store: Store = { builtAt: new Date().toISOString(), papers: tagged };
  writeFileSync(out, JSON.stringify(store, null, 0) + "\n");

  const untagged = tagged.filter((p) => p.tags.length === 0).length;
  console.log(`wrote ${tagged.length} papers to ${out} (${untagged} without a topic)`);
}

void main();
