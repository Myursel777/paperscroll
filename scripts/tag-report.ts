// Tagger quality report.
//
//   npx tsx scripts/tag-report.ts fetch    pull a fresh sample from arXiv into
//                                          tests/fixtures/tag-sample.json
//                                          (one polite request per field)
//   npx tsx scripts/tag-report.ts          tag the saved sample and print, per
//                                          field, each paper with its tags and
//                                          the patterns that fired, then the
//                                          tag distribution
//   npx tsx scripts/tag-report.ts eval     precision and recall per topic over
//                                          the papers that have an `expected`
//                                          list in the sample file
//
// Labelling: open tests/fixtures/tag-sample.json and set `expected` on a paper
// to the topic ids it should carry (an empty list means "no topic applies").
// Papers with `expected: null` are unlabelled and skipped by `eval`.

import { readFileSync, writeFileSync } from "node:fs";
import { FIELDS, type Paper } from "../lib/arxiv";
import { buildQueryUrl, createArxivClient } from "../lib/arxivClient";
import { scoreTopics, tagPaper } from "../lib/tagger";
import { TOPICS } from "../lib/topics";

const SAMPLE_FILE = "tests/fixtures/tag-sample.json";
const PER_FIELD = 25;

type Sample = { fetchedAt: string; papers: (Paper & { field: string; expected: string[] | null })[] };

async function fetchSample() {
  const client = createArxivClient({ log: (m) => console.log(m) });
  const papers: Sample["papers"] = [];
  for (const field of FIELDS) {
    const { papers: got } = await client.getPapers(buildQueryUrl({ cats: field.cats, max: PER_FIELD }));
    for (const p of got) papers.push({ ...p, field: field.id, expected: null });
  }
  const sample: Sample = { fetchedAt: new Date().toISOString(), papers };
  writeFileSync(SAMPLE_FILE, JSON.stringify(sample, null, 2) + "\n");
  console.log(`saved ${papers.length} papers to ${SAMPLE_FILE}`);
}

function loadSample(): Sample {
  return JSON.parse(readFileSync(SAMPLE_FILE, "utf8"));
}

function report() {
  const { papers, fetchedAt } = loadSample();
  console.log(`Sample of ${papers.length} papers fetched ${fetchedAt}\n`);

  const counts = new Map<string, number>();
  let untagged = 0;
  for (const field of FIELDS) {
    console.log(`=== ${field.label}`);
    for (const p of papers.filter((x) => x.field === field.id)) {
      const scores = scoreTopics(p).slice(0, 3);
      if (scores.length === 0) untagged += 1;
      for (const s of scores) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
      const tags = scores.map((s) => `${s.id}(${s.score}: ${s.hits.slice(0, 2).join(" | ")})`).join("  ");
      console.log(`- ${p.title.slice(0, 90)}`);
      console.log(`    ${tags || "(no tags)"}`);
    }
    console.log();
  }

  console.log("=== Tag distribution");
  for (const t of TOPICS) {
    const n = counts.get(t.id) ?? 0;
    if (n > 0) console.log(`${String(n).padStart(4)}  ${t.id}`);
  }
  const never = TOPICS.filter((t) => !counts.has(t.id)).map((t) => t.id);
  console.log(`\nuntagged papers: ${untagged} of ${papers.length}`);
  console.log(`topics never used in this sample: ${never.join(", ") || "none"}`);
}

function evaluate() {
  const { papers } = loadSample();
  const labelled = papers.filter((p) => p.expected !== null);
  if (labelled.length === 0) {
    console.log("No labelled papers yet. Set `expected` on papers in the sample file first.");
    return;
  }
  const tp = new Map<string, number>();
  const fp = new Map<string, number>();
  const fn = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  let exactMatches = 0;
  for (const p of labelled) {
    const predicted = new Set(tagPaper(p));
    const expected = new Set(p.expected!);
    for (const t of predicted) bump(expected.has(t) ? tp : fp, t);
    for (const t of expected) if (!predicted.has(t)) bump(fn, t);
    if (predicted.size === expected.size && [...predicted].every((t) => expected.has(t))) exactMatches += 1;
  }

  console.log(`Labelled papers: ${labelled.length}; exact tag-set matches: ${exactMatches}\n`);
  console.log("topic                        prec   rec   tp  fp  fn");
  let TP = 0, FP = 0, FN = 0;
  for (const t of TOPICS) {
    const a = tp.get(t.id) ?? 0, b = fp.get(t.id) ?? 0, c = fn.get(t.id) ?? 0;
    TP += a; FP += b; FN += c;
    if (a + b + c === 0) continue;
    const prec = a + b ? (a / (a + b)).toFixed(2) : "  -  ";
    const rec = a + c ? (a / (a + c)).toFixed(2) : "  -  ";
    console.log(`${t.id.padEnd(28)} ${prec}  ${rec}  ${String(a).padStart(3)} ${String(b).padStart(3)} ${String(c).padStart(3)}`);
  }
  console.log(`\noverall precision ${(TP / (TP + FP || 1)).toFixed(2)}, recall ${(TP / (TP + FN || 1)).toFixed(2)}`);
}

const mode = process.argv[2] ?? "report";
if (mode === "fetch") fetchSample();
else if (mode === "eval") evaluate();
else report();
