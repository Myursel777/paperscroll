// Nightly job, step 1: fetch recent papers from arXiv and tag them.
//
//   npx tsx scripts/nightly/fetch.ts [out.json]
//
// This is the only place arXiv is called on a schedule. It walks every field
// in lib/arxiv.ts and asks for the newest PER_FIELD papers. The arXiv client
// is the same one the app uses, so the three-second spacing, the cache, and
// the 429 backoff all apply: about a dozen requests, once a night, from one
// machine.
//
// Being refused is normal here and is handled in two steps. The search API
// limits by address, and a GitHub Actions runner shares its address with
// every other job on that machine, so the first request of the night can come
// back 429 through no fault of ours.
//   1. Wait and try again, a few times, honouring the Retry-After arXiv sends.
//   2. Still refused: fall back to the daily RSS feeds (lib/arxivRss.ts),
//      which are served by a different host. They carry only the latest
//      announcement and nothing at weekends, which is a thinner night but
//      better than none.
// If both refuse, the job writes an empty file, prints a warning, and stops
// without failing: the store keeps yesterday's papers and the site falls back
// to asking arXiv live, exactly as it does with no store at all.
//
// Tagging: the embedding tagger when RECOMMENDER_URL is set and answers, the
// rule-based tagger otherwise (lib/neuralTagger.ts decides, exactly as the
// API route does). Doing it here means the tags are computed once for
// everyone instead of on every reader's request.
//
// Step 2 (recommender/embed.py) adds an embedding to each paper; step 3
// (upload.ts) writes them to Supabase.

import { writeFileSync } from "node:fs";
import { FIELDS, type Paper } from "../../lib/arxiv";
import { ArxivError, buildQueryUrl, createArxivClient } from "../../lib/arxivClient";
import { parseRssFeed, rssUrl } from "../../lib/arxivRss";
import { createNeuralTagger } from "../../lib/neuralTagger";
import { USER_AGENT } from "../../lib/arxivClient";

/** Papers per field per night. Six fields, so about 600 papers a night.
 *  NIGHTLY_PER_FIELD lowers it for a quick rehearsal against the fake. */
const PER_FIELD = Number(process.env.NIGHTLY_PER_FIELD ?? 100);
/** arXiv caps a single request; the job pages up to this. */
const PAGE = 50;
/** How many times to wait out a 429 before giving up on the search API. */
const MAX_WAITS = 4;
/** Longest single wait, so a bad night cannot outlast the job's timeout. */
const MAX_WAIT_S = 300;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  const out = process.argv[2] ?? "papers.json";
  const client = createArxivClient({ log: (m) => console.log(m) });
  const byId = new Map<string, Paper>();
  let waitsLeft = MAX_WAITS;
  let throttled = false;

  // --- the search API, with patience ---
  outer: for (const field of FIELDS) {
    for (let start = 0; start < PER_FIELD; start += PAGE) {
      const url = buildQueryUrl({ cats: field.cats, start, max: Math.min(PAGE, PER_FIELD - start) });
      try {
        const { papers, stale } = await client.getPapers(url);
        console.log(`${field.id}: ${papers.length} papers from ${start}${stale ? " (cached)" : ""}`);
        for (const p of papers) byId.set(p.id, p);
        if (papers.length === 0) break;
      } catch (err) {
        if (err instanceof ArxivError && err.status === 429 && waitsLeft > 0) {
          const wait = Math.min(err.retryAfter || 60, MAX_WAIT_S);
          waitsLeft -= 1;
          console.log(`arXiv is throttling this machine; waiting ${wait}s (${waitsLeft} waits left)`);
          await sleep(wait * 1000);
          start -= PAGE; // try the same page again
          continue;
        }
        console.error(`${field.id}: ${(err as Error).message}`);
        // Out of patience: stop asking the API and try the feeds instead.
        if (err instanceof ArxivError && err.status === 429) {
          throttled = true;
          break outer;
        }
        break;
      }
    }
  }

  // --- the daily feeds, when the API gave nothing or was cut short ---
  if (throttled || byId.size === 0) {
    console.log(
      `Search API gave ${byId.size} papers${throttled ? " before refusing" : ""}; topping up from the daily RSS feeds.`,
    );
    for (const field of FIELDS) {
      for (const cat of field.cats) {
        try {
          const res = await fetch(rssUrl(cat), { headers: { "User-Agent": USER_AGENT } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const papers = parseRssFeed(await res.text(), cat);
          console.log(`${cat}: ${papers.length} papers from the feed`);
          for (const p of papers) byId.set(p.id, p);
        } catch (err) {
          console.error(`${cat} feed: ${(err as Error).message}`);
        }
        await sleep(3000); // the same spacing the API gets
      }
    }
  }

  const fetched = [...byId.values()];
  if (fetched.length === 0) {
    // A warning, not a failure: the store keeps what it has and the site is
    // unaffected. A red run every time arXiv is busy would train everyone to
    // ignore the red.
    console.log("::warning::arXiv returned nothing tonight; the store keeps yesterday's papers.");
    writeFileSync(out, JSON.stringify({ builtAt: new Date().toISOString(), papers: [] }) + "\n");
    return;
  }

  const tagged = await tagger().tagPapersBest(fetched);
  const store: Store = { builtAt: new Date().toISOString(), papers: tagged };
  writeFileSync(out, JSON.stringify(store, null, 0) + "\n");

  const untagged = tagged.filter((p) => p.tags.length === 0).length;
  console.log(`wrote ${tagged.length} papers to ${out} (${untagged} without a topic)`);
}

export type StoredPaper = Paper & { embedding?: number[] };
export type Store = { builtAt: string; papers: StoredPaper[] };

const tagger = () =>
  createNeuralTagger({
    url: process.env.RECOMMENDER_URL ?? process.env.NEXT_PUBLIC_RECOMMENDER_URL,
    timeoutMs: 60_000, // a batch of a hundred abstracts, not a page request
    log: (m) => console.log(m),
  });

void main();
