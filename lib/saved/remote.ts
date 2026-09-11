// The account's saved papers in Supabase (table saved_papers, see
// supabase/migrations/0001_accounts.sql). Row-level security means these
// calls only ever see the signed-in user's rows; user_id is still sent so the
// insert policy's check passes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Paper } from "@/lib/arxiv";
import type { SavedPaper } from "@/lib/saved/merge";

type Row = {
  paper_id: string;
  paper: Paper;
  saved_at: string;
  collection_id: string | null;
};

const rowToSaved = (r: Row): SavedPaper => ({
  ...r.paper,
  id: r.paper_id,
  categories: r.paper.categories ?? [],
  tags: r.paper.tags ?? [],
  savedAt: r.saved_at,
  collectionId: r.collection_id,
});

export async function fetchRemoteSaved(supabase: SupabaseClient, userId: string): Promise<SavedPaper[]> {
  const { data, error } = await supabase
    .from("saved_papers")
    .select("paper_id, paper, saved_at, collection_id")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(rowToSaved);
}

export async function upsertRemoteSaved(supabase: SupabaseClient, userId: string, papers: SavedPaper[]) {
  if (papers.length === 0) return;
  const rows = papers.map(({ savedAt, collectionId, ...paper }) => ({
    user_id: userId,
    paper_id: paper.id,
    paper,
    saved_at: savedAt,
    collection_id: collectionId ?? null,
  }));
  const { error } = await supabase.from("saved_papers").upsert(rows, { onConflict: "user_id,paper_id" });
  if (error) throw error;
}

export async function deleteRemoteSaved(supabase: SupabaseClient, userId: string, paperId: string) {
  const { error } = await supabase.from("saved_papers").delete().eq("user_id", userId).eq("paper_id", paperId);
  if (error) throw error;
}

export async function setRemoteCollection(
  supabase: SupabaseClient,
  userId: string,
  paperId: string,
  collectionId: string | null,
) {
  const { error } = await supabase
    .from("saved_papers")
    .update({ collection_id: collectionId })
    .eq("user_id", userId)
    .eq("paper_id", paperId);
  if (error) throw error;
}
