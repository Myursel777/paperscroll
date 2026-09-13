// Reading the nightly paper store, from the server.
//
// The store (table papers, filled by .github/workflows/nightly.yml) is public
// to read, so this needs nothing but the two public Supabase values and plain
// fetch. It talks to PostgREST directly rather than through the Supabase
// client because the API route wants one small query with a timeout, and
// because a hand-built URL can be unit tested without a server.
//
// Why the API route needs it: arXiv refuses requests intermittently, and the
// client in lib/arxivClient.ts then stops calling arXiv for a minute, which
// is the right thing to do to a service asking for quiet. On a serverless
// host that minute is expensive, because each instance starts with an empty
// cache, so a visitor arriving during the pause has nothing to look at. The
// store already holds recent papers with their topics, so the route serves
// those instead of an error card. Papers may be up to a day old, which is a
// far better answer than none.

import type { Paper } from "@/lib/arxiv";

export const STORE_COLUMNS =
  "id, title, summary, authors, published, pdf_link, primary_category, categories, tags, popularity";

const DEFAULT_TIMEOUT_MS = 3000;

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

/** A stored row as the app's Paper. Tags are already computed by the job. */
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

export type StoreQuery = {
  /** arXiv categories for the field; a paper matches if it carries any of them. */
  cats: string[];
  /** Optional search, matched against the title and the abstract. */
  q?: string;
  start?: number;
  max?: number;
};

type Deps = {
  url?: string;
  key?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (message: string) => void;
};

export function createPapersStore(deps: Deps = {}) {
  const base = deps.url?.replace(/\/$/, "") ?? "";
  const key = deps.key ?? "";
  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = deps.log ?? ((m: string) => console.warn(m));

  /** False when no Supabase project is configured, in which case there is no store. */
  const enabled = base.length > 0 && key.length > 0;

  /**
   * The PostgREST query for one page of a field, newest first.
   * Exported through the returned object so the shape can be unit tested.
   */
  function buildUrl({ cats, q, start = 0, max = 12 }: StoreQuery): string {
    const params = new URLSearchParams();
    params.set("select", STORE_COLUMNS);
    params.set("order", "published.desc");
    params.set("offset", String(Math.max(0, start)));
    params.set("limit", String(Math.min(Math.max(max, 1), 50)));
    // A paper belongs to the field if any of its categories is one of the
    // field's, which is the same rule the arXiv query uses.
    if (cats.length > 0) params.set("categories", `ov.{${cats.join(",")}}`);

    const search = (q ?? "").trim();
    if (search) {
      // PostgREST splits these on commas and parentheses, so they cannot
      // appear inside the pattern. `*` is its wildcard.
      const safe = search.replace(/[(),*]/g, " ").replace(/\s+/g, " ").trim();
      if (safe) params.set("or", `(title.ilike.*${safe}*,summary.ilike.*${safe}*)`);
    }
    return `${base}/rest/v1/papers?${params.toString()}`;
  }

  /**
   * One page of stored papers, or an empty list when there is no store, it
   * cannot be reached, or it holds nothing matching. Never throws: this is a
   * fallback, and a failing fallback must not replace the original error.
   */
  async function getPapers(query: StoreQuery): Promise<Paper[]> {
    if (!enabled) return [];
    try {
      const res = await doFetch(buildUrl(query), {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as StoreRow[];
      return Array.isArray(rows) ? rows.map(storeRowToPaper) : [];
    } catch (err) {
      log(`Paper store unavailable. ${(err as Error)?.message ?? err}`);
      return [];
    }
  }

  return { enabled, buildUrl, getPapers };
}

/** Server-side default, using the same public values the browser uses. */
export const papersStore = createPapersStore({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
