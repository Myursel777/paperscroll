// How good is For You? Precision at 10, measured on the saved paper sample.
//
//   npx tsx scripts/foryou-eval.ts            all engines, one table
//   npx tsx scripts/foryou-eval.ts --verbose  plus a line per simulated reader
//
// There is no click log to learn from yet, so this builds readers out of the
// tagged sample in tests/fixtures/tag-sample.json (150 papers, see
// scripts/tag-report.ts). For every topic with at least MIN_PAPERS papers:
//
//   1. a reader is invented who saved LIKES of that topic's papers;
//   2. those papers are removed from the candidate pool;
//   3. each engine ranks the rest;
//   4. precision at 10 is the share of the top ten that carry the topic.
//
// A paper counts as relevant when it shares the topic, which is the same
// judgement the tagger made, so this measures "does the ranking keep the
// reader's topic near the top", not whether the tags themselves are right.
// That is what the tagger report and its hand-labelled sample are for.
//
// Read the numbers with that in mind: relevance is defined by the topic tag,
// so the topic engine is being marked against its own definition and starts
// with an advantage. The interesting comparisons are every engine against
// recency, and the blend against the topic engine alone: the blend has to
// show that adding content similarity, freshness, and diversity costs
// nothing in precision, because those are what make the feed readable rather
// than fifty papers on one subject.
//
// Engines:
//   recency   newest first; the baseline every other engine has to beat
//   tfidf     lib/recommender.ts, the word-overlap engine
//   topic     topic affinity from lib/foryou/profile.ts alone
//   blend     lib/foryou/rank.ts, what the app actually uses
//   neural    the sentence-transformer service, only when RECOMMENDER_URL is
//             set and answers
//
// The blend's exploration slots are switched off here: they exist to show the
// reader something outside their topics, so counting them as mistakes would
// measure the wrong thing. Diversity stays on, because it is part of the
// ranking the reader sees.

import { readFileSync } from "node:fs";
import type { Paper } from "../lib/arxiv";
import { makeEvent } from "../lib/foryou/events";
import { topicProfile } from "../lib/foryou/profile";
import { rankForYou } from "../lib/foryou/rank";
import { rankNeural } from "../lib/neuralRecommender";
import { recencyScore, recommend } from "../lib/recommender";
import { tagPaper } from "../lib/tagger";
import { topicById } from "../lib/topics";

const SAMPLE_FILE = "tests/fixtures/tag-sample.json";
const AT = 10;
const LIKES = 3;
const MIN_PAPERS = 8;

type Sample = { fetchedAt: string; papers: (Paper & { field: string })[] };
type Engine = { name: string; rank: (liked: Paper[], pool: Paper[]) => Promise<Paper[]> };

const engines: Engine[] = [
  {
    name: "recency",
    rank: async (_liked, pool) => [...pool].sort((a, b) => recencyScore(b.published) - recencyScore(a.published)),
  },
  {
    name: "tfidf",
    rank: async (liked, pool) => recommend(liked, pool).map((s) => s.paper),
  },
  {
    name: "topic",
    rank: async (liked, pool) => {
      const profile = profileFrom(liked);
      return rankForYou(
        pool.map((paper) => ({ paper, similarity: 0 })),
        { profile, explore: false, now: Date.now() },
      ).map((r) => r.paper);
    },
  },
  {
    name: "blend",
    rank: async (liked, pool) => {
      const profile = profileFrom(liked);
      // Similarity from the same TF-IDF engine the browser uses when there is
      // no paper store, so this is the honest zero-setup configuration.
      const sims = new Map(recommend(liked, pool).map((s) => [s.paper.id, s.similarity]));
      return rankForYou(
        pool.map((paper) => ({ paper, similarity: sims.get(paper.id) ?? 0 })),
        { profile, explore: false, now: Date.now() },
      ).map((r) => r.paper);
    },
  },
];

if (process.env.RECOMMENDER_URL ?? process.env.NEXT_PUBLIC_RECOMMENDER_URL) {
  engines.push({
    name: "neural",
    rank: async (liked, pool) => {
      const ranked = await rankNeural(liked, pool);
      if (!ranked) throw new Error("the recommender service did not answer");
      return ranked.map((s) => s.paper);
    },
  });
}

/** A reader who saved these papers, today. */
function profileFrom(liked: Paper[]) {
  return topicProfile({ events: liked.map((p) => makeEvent("save", p)) });
}

function precisionAt(ranked: Paper[], relevant: Set<string>, at: number) {
  const top = ranked.slice(0, at);
  if (top.length === 0) return 0;
  return top.filter((p) => relevant.has(p.id)).length / top.length;
}

async function main() {
  const verbose = process.argv.includes("--verbose");
  const sample: Sample = JSON.parse(readFileSync(SAMPLE_FILE, "utf8"));
  const { fetchedAt } = sample;
  // The sample is stored as arXiv returned it, so the tags are computed here,
  // exactly as the API route computes them for the feed.
  const papers = sample.papers.map((p) => ({ ...p, tags: tagPaper(p) }));

  // Every topic the sample has enough papers for.
  const byTopic = new Map<string, Paper[]>();
  for (const p of papers) {
    for (const t of p.tags ?? []) byTopic.set(t, [...(byTopic.get(t) ?? []), p]);
  }
  const topics = [...byTopic.entries()].filter(([, list]) => list.length >= MIN_PAPERS);
  if (topics.length === 0) {
    console.log(`No topic has ${MIN_PAPERS} papers in the sample. Run: npx tsx scripts/tag-report.ts fetch`);
    return;
  }

  console.log(`Sample of ${papers.length} papers fetched ${fetchedAt}`);
  console.log(`${topics.length} topics with at least ${MIN_PAPERS} papers; a reader per topic saves ${LIKES}.\n`);

  const totals = new Map<string, number[]>();
  for (const [topicId, list] of topics) {
    const liked = list.slice(0, LIKES);
    const likedIds = new Set(liked.map((p) => p.id));
    const pool = papers.filter((p) => !likedIds.has(p.id));
    const relevant = new Set(pool.filter((p) => (p.tags ?? []).includes(topicId)).map((p) => p.id));
    if (relevant.size === 0) continue;

    const line: string[] = [];
    for (const engine of engines) {
      const precision = precisionAt(await engine.rank(liked, pool), relevant, AT);
      totals.set(engine.name, [...(totals.get(engine.name) ?? []), precision]);
      line.push(`${engine.name} ${precision.toFixed(2)}`);
    }
    if (verbose) {
      console.log(`${(topicById(topicId)?.label ?? topicId).padEnd(28)} ${relevant.size} relevant   ${line.join("   ")}`);
    }
  }

  if (verbose) console.log();
  console.log(`=== Mean precision at ${AT} over ${totals.get(engines[0].name)?.length ?? 0} readers`);
  const baseline = mean(totals.get("recency") ?? []);
  for (const engine of engines) {
    const value = mean(totals.get(engine.name) ?? []);
    // In points, not per cent: the baseline is near zero, so a ratio would
    // read as a four-figure improvement and mean nothing.
    const gain = `+${(value - baseline).toFixed(3)} over recency`;
    console.log(`${engine.name.padEnd(10)} ${value.toFixed(3)}   ${engine.name === "recency" ? "baseline" : gain}`);
  }
  console.log("");
  console.log("Relevance here is the topic tag itself, so the topic engine is judged");
  console.log("against its own definition. See the note at the top of this file.");
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

void main();
