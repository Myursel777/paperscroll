// The only code that talks to arXiv.
//
// It lives here rather than inside the API route so the rules below can be
// unit tested with a fake fetch and a fake clock (see tests/unit). The route
// just parses the request, asks this client for papers, and shapes the reply.
//
// arXiv is a free academic API that answers bursts with HTTP 429, so the
// client is deliberately gentle:
//   1. One outgoing call at a time, SPACING_MS apart (arXiv asks for at most
//      one request every three seconds).
//   2. Every query is cached for CACHE_TTL_MS, so switching back to a field
//      never refetches. Expired entries are kept as a fallback for rule 4.
//   3. Identical requests that arrive while one is in flight share that call.
//   4. After a 429 nothing is sent until the backoff has passed. There is no
//      retry loop on purpose: retrying a 429 only makes the throttle last
//      longer. Callers get the stale copy if one exists, otherwise an error.

import { XMLParser } from "fast-xml-parser";
import { entryToPaper, type Paper } from "@/lib/arxiv";

export const ARXIV_API = "https://export.arxiv.org/api/query";
export const USER_AGENT = "PaperScroll/0.1 (student project)";
export const SPACING_MS = 3000;
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_BACKOFF_S = 60;

export class ArxivError extends Error {
  constructor(
    public status: number,
    /** Seconds to wait; only meaningful when status is 429. */
    public retryAfter: number = 0,
  ) {
    super(`arXiv HTTP ${status}`);
  }
}

export type ArxivResult = {
  papers: Paper[];
  /** True when arXiv could not be reached and an expired cache entry was served. */
  stale: boolean;
};

/** Build the arXiv query URL for a set of categories, an optional search, and a page. */
export function buildQueryUrl(opts: { cats: string[]; q?: string; start?: number; max?: number }) {
  const catClause = opts.cats.map((c) => `cat:${c}`).join("+OR+");
  const q = (opts.q ?? "").trim();
  const searchQuery = q ? `(${catClause})+AND+all:${encodeURIComponent(q)}` : catClause;
  return (
    `${ARXIV_API}?search_query=${searchQuery}` +
    `&start=${opts.start ?? 0}&max_results=${opts.max ?? 12}` +
    `&sortBy=submittedDate&sortOrder=descending`
  );
}

// Everything the client needs from the outside world, so tests can swap it.
type Deps = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
};

type Entry = { papers: Paper[]; fetchedAt: number };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

export function createArxivClient(deps: Deps = {}) {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((m: string) => console.log(m));

  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<Entry>>();
  let backoffUntil = 0; // epoch ms; while in the future, rule 4 applies
  let chain: Promise<unknown> = Promise.resolve();

  // Rule 1. Each task is chained after the previous one. The caller gets its
  // result as soon as its own task finishes; the spacing only delays the next.
  function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task);
    chain = run.then(
      () => sleep(SPACING_MS),
      () => sleep(SPACING_MS),
    );
    return run;
  }

  const secondsLeftInBackoff = () => Math.ceil((backoffUntil - now()) / 1000);

  async function fetchPapers(url: string): Promise<Paper[]> {
    const res = await doFetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || DEFAULT_BACKOFF_S;
      backoffUntil = now() + retryAfter * 1000;
      throw new ArxivError(429, retryAfter);
    }
    if (!res.ok) throw new ArxivError(res.status);

    const data = parser.parse(await res.text());
    const entries = data?.feed?.entry ?? [];
    const list = Array.isArray(entries) ? entries : [entries]; // one entry parses as an object
    return list
      .filter(Boolean)
      .map(entryToPaper)
      .filter((p) => p.id && p.title);
  }

  // Rules 2, 3 and 4. Resolves with a fresh entry or throws.
  function getFresh(url: string): Promise<Entry> {
    const hit = cache.get(url);
    if (hit && now() - hit.fetchedAt < CACHE_TTL_MS) return Promise.resolve(hit);

    const pending = inflight.get(url);
    if (pending) return pending;

    if (now() < backoffUntil) return Promise.reject(new ArxivError(429, secondsLeftInBackoff()));

    const run = schedule(async () => {
      // The backoff may have started while this request waited in the queue.
      if (now() < backoffUntil) throw new ArxivError(429, secondsLeftInBackoff());
      log(`arXiv GET ${url}`);
      const entry = { papers: await fetchPapers(url), fetchedAt: now() };
      cache.set(url, entry);
      return entry;
    }).finally(() => inflight.delete(url));

    inflight.set(url, run);
    return run;
  }

  /**
   * Papers for a query URL. Fresh when possible, the expired cache entry when
   * arXiv fails, and an error (usually ArxivError) only when there is nothing
   * at all to show.
   */
  async function getPapers(url: string): Promise<ArxivResult> {
    try {
      const entry = await getFresh(url);
      return { papers: entry.papers, stale: false };
    } catch (err) {
      const stale = cache.get(url);
      if (stale) return { papers: stale.papers, stale: true };
      throw err;
    }
  }

  return { getPapers };
}
