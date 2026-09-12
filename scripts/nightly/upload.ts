// Nightly job, step 3: write the papers into Supabase and refresh popularity.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/nightly/upload.ts papers.json
//
// About the key: this is the only piece of PaperScroll that uses the
// service-role key, and it runs in GitHub Actions, never in the app and never
// in a browser. The key belongs in the repository secrets and nowhere else:
// not in `.env.local`, not in any NEXT_PUBLIC_ variable. The website only
// ever reads this table, with the public key, through a policy that allows
// reading and nothing else.
//
// Against the fake Supabase (scripts/fake-supabase.ts) the key is the literal
// "fake-service-key", so the whole job can be rehearsed locally:
//
//   npm run fake-supabase
//   npx tsx scripts/nightly/fetch.ts papers.json
//   SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_KEY=fake-service-key \
//     npx tsx scripts/nightly/upload.ts papers.json
//
// What it does:
//   1. upserts every paper (metadata, tags, embedding) into `papers`;
//   2. recomputes `popularity` from the events of the last POPULARITY_DAYS,
//      counting saves and reads across all readers, normalised so the most
//      popular paper of the period is 1. Nothing about who did what is read
//      or stored: the job only counts rows per paper;
//   3. deletes papers older than KEEP_DAYS so the free tier stays small.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Store } from "./fetch";

const BATCH = 200;
const POPULARITY_DAYS = 14;
const KEEP_DAYS = 120;
/** Event types that count as liking a paper, with their weight. */
const POPULAR_EVENTS: Record<string, number> = { save: 3, read: 2, expand: 1 };

async function main() {
  const file = process.argv[2] ?? "papers.json";
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.log("SUPABASE_URL or SUPABASE_SERVICE_KEY is not set; nothing to upload.");
    return;
  }

  const store: Store = JSON.parse(readFileSync(file, "utf8"));
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1. The papers themselves.
  const rows = store.papers.map((p) => ({
    id: p.id,
    title: p.title,
    summary: p.summary,
    authors: p.authors,
    published: p.published,
    pdf_link: p.pdfLink,
    primary_category: p.primaryCategory,
    categories: p.categories,
    tags: p.tags,
    embedding: p.embedding ?? null,
    fetched_at: store.builtAt,
  }));
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("papers").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`upsert failed: ${error.message}`);
    console.log(`upserted ${Math.min(i + BATCH, rows.length)} of ${rows.length}`);
  }
  const withVector = rows.filter((r) => r.embedding !== null).length;
  console.log(`${withVector} of ${rows.length} papers carry an embedding`);

  // 2. Popularity from recent events.
  const since = new Date(Date.now() - POPULARITY_DAYS * 86_400_000).toISOString();
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("paper_id, type")
    .gte("created_at", since)
    .in("type", Object.keys(POPULAR_EVENTS))
    .limit(50_000);
  if (eventsError) console.warn(`could not read events: ${eventsError.message}`);

  const scores = popularityScores((events ?? []) as { paper_id: string; type: string }[]);
  // An update per paper: a popular night is a few dozen rows, and an update
  // (rather than an upsert) can never create a paper the store does not have.
  for (const [id, popularity] of scores) {
    const { error } = await supabase.from("papers").update({ popularity }).eq("id", id);
    if (error) console.warn(`popularity for ${id}: ${error.message}`);
  }
  console.log(`popularity refreshed for ${scores.size} papers`);

  // 3. Prune.
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const { error: pruneError } = await supabase.from("papers").delete().lt("published", cutoff);
  if (pruneError) console.warn(`prune failed: ${pruneError.message}`);
  else console.log(`pruned papers published before ${cutoff.slice(0, 10)}`);
}

/**
 * Weighted event counts per paper, scaled so the busiest paper is 1.
 * Exported for the unit test.
 */
export function popularityScores(events: { paper_id: string; type: string }[]): Map<string, number> {
  const raw = new Map<string, number>();
  for (const e of events) {
    const w = POPULAR_EVENTS[e.type] ?? 0;
    if (w === 0) continue;
    raw.set(e.paper_id, (raw.get(e.paper_id) ?? 0) + w);
  }
  const max = Math.max(...raw.values(), 0);
  if (max === 0) return new Map();
  const out = new Map<string, number>();
  for (const [id, v] of raw) out.set(id, Number((v / max).toFixed(4)));
  return out;
}

if (process.argv[1]?.includes("upload")) void main();
