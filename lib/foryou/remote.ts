// Supabase calls for For You: the reader's events and the paper store.
//
// Events (table events) are private to the owner through row-level security.
// The paper store (table papers) is readable by everyone, signed in or not,
// so the store path of For You also works for logged-out visitors when a
// project is configured. See supabase/migrations/0002_for_you.sql.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paper } from "@/lib/arxiv";
import { KEEP_DAYS, type ReadingEvent } from "@/lib/foryou/events";

const EVENT_FETCH_LIMIT = 1500;

type EventRow = { paper_id: string; type: ReadingEvent["type"]; value: number | null; tags: string[]; created_at: string };

const rowToEvent = (r: EventRow): ReadingEvent => ({
  type: r.type,
  paperId: r.paper_id,
  tags: r.tags ?? [],
  value: r.value,
  at: r.created_at,
});

/** The account's recent events, newest first. */
export async function fetchRemoteEvents(supabase: SupabaseClient, userId: string): Promise<ReadingEvent[]> {
  const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("events")
    .select("paper_id, type, value, tags, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(EVENT_FETCH_LIMIT);
  if (error) throw error;
  return (data as EventRow[]).map(rowToEvent);
}

export async function insertRemoteEvents(supabase: SupabaseClient, userId: string, events: ReadingEvent[]) {
  if (events.length === 0) return;
  const rows = events.map((e) => ({
    user_id: userId,
    paper_id: e.paperId,
    type: e.type,
    value: e.value,
    tags: e.tags,
    created_at: e.at,
  }));
  const { error } = await supabase.from("events").insert(rows);
  if (error) throw error;
}

/** Undo of "not interested": removes the hide events for one paper. */
export async function deleteRemoteHide(supabase: SupabaseClient, userId: string, paperId: string) {
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("user_id", userId)
    .eq("paper_id", paperId)
    .eq("type", "not_interested");
  if (error) throw error;
}

/** Clears the account's reading history. */
export async function deleteAllRemoteEvents(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from("events").delete().eq("user_id", userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// The paper store
// ---------------------------------------------------------------------------

export type StoreRow = {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  pdf_link: string | null;
  primary_category: string | null;
  categories: string[];
  tags: string[];
  popularity: number;
  similarity?: number;
};

export const STORE_COLUMNS = "id, title, summary, authors, published, pdf_link, primary_category, categories, tags, popularity";

export function storeRowToPaper(r: StoreRow): Paper {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    authors: r.authors ?? [],
    published: r.published,
    pdfLink: r.pdf_link,
    primaryCategory: r.primary_category,
    categories: r.categories ?? [],
    tags: r.tags ?? [],
  };
}

/** True when the nightly job has filled the store at least once. */
export async function storeHasPapers(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.from("papers").select("id").limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Embeddings for the given paper ids (those the store knows). */
export async function fetchEmbeddings(supabase: SupabaseClient, ids: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from("papers").select("id, embedding").in("id", ids).not("embedding", "is", null);
  if (error) throw error;
  for (const row of data as { id: string; embedding: unknown }[]) {
    const vec = parseVector(row.embedding);
    if (vec) out.set(row.id, vec);
  }
  return out;
}

// PostgREST returns a pgvector column as text ("[0.1,0.2,...]"); a JSON array
// is accepted too in case that changes.
function parseVector(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === "string") {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(Number) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Papers closest to a content profile vector, with similarity. */
export async function nearestPapers(supabase: SupabaseClient, query: number[], n: number): Promise<StoreRow[]> {
  const { data, error } = await supabase.rpc("nearest_papers", { query, n });
  if (error) throw error;
  return (data ?? []) as StoreRow[];
}

/** The newest papers tagged with any of the topics. */
export async function recentPapersByTags(supabase: SupabaseClient, topics: string[], n: number): Promise<StoreRow[]> {
  if (topics.length === 0) return [];
  const { data, error } = await supabase
    .from("papers")
    .select(STORE_COLUMNS)
    .overlaps("tags", topics)
    .order("published", { ascending: false })
    .limit(n);
  if (error) throw error;
  return (data ?? []) as StoreRow[];
}

/** The newest papers in the store, any topic. */
export async function recentPapers(supabase: SupabaseClient, n: number): Promise<StoreRow[]> {
  const { data, error } = await supabase
    .from("papers")
    .select(STORE_COLUMNS)
    .order("published", { ascending: false })
    .limit(n);
  if (error) throw error;
  return (data ?? []) as StoreRow[];
}
