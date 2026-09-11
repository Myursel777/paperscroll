// Pure logic for combining the browser's saved papers with the account's.
//
// The browser keeps its own list (localStorage) so saving works logged out
// and offline. When a user is signed in, the account is the shared copy. On
// the first login in a browser the two are merged: nothing is lost in either
// direction. After that the account leads and the browser mirrors it.

import type { Paper } from "@/lib/arxiv";

export type SavedPaper = Paper & {
  savedAt: string;
  /** Collection the paper is filed under, when signed in. */
  collectionId?: string | null;
};

export type MergeResult = {
  /** The union, newest save first. */
  merged: SavedPaper[];
  /** Papers only the browser had: these need uploading to the account. */
  toUpload: SavedPaper[];
};

export function mergeSaved(local: SavedPaper[], remote: SavedPaper[]): MergeResult {
  const remoteIds = new Set(remote.map((p) => p.id));
  const toUpload = local.filter((p) => !remoteIds.has(p.id));
  const merged = [...remote, ...toUpload].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return { merged, toUpload };
}

/** Newest first, one entry per paper id (the first occurrence wins). */
export function normaliseSaved(list: SavedPaper[]): SavedPaper[] {
  const seen = new Set<string>();
  return list
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
