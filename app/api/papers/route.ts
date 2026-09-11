import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { entryToPaper, fieldById, type Paper } from "@/lib/arxiv";

const ARXIV = "https://export.arxiv.org/api/query";
const USER_AGENT = "PaperScroll/0.1 (student project)";

// arXiv is a free academic API that rate-limits bursts with HTTP 429, so this
// route is deliberately gentle:
//   1. Every outgoing call goes through one queue, spaced SPACING_MS apart.
//   2. Results are cached per query for CACHE_TTL_MS, so switching back to a
//      field (or opening "For You" twice) never refetches.
//   3. Identical requests that arrive while one is in flight share that call.
//   4. On 429 we serve the stale cache if we have one; otherwise we tell the
//      client to wait, and we stop calling arXiv until the backoff has passed.
// There is no retry loop on purpose: retrying a 429 only extends the throttle.
const SPACING_MS = 3000; // arXiv asks for at most one request every 3 seconds
const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_BACKOFF_S = 60;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Entry = { papers: Paper[]; fetchedAt: number };
const cache = new Map<string, Entry>(); // stale entries are kept for 429 fallback
const inflight = new Map<string, Promise<Entry>>();
let backoffUntil = 0; // epoch ms; while in the future, no arXiv calls are made

let chain: Promise<unknown> = Promise.resolve();

// Runs tasks one at a time. The caller gets its result as soon as its own
// task finishes; the spacing only delays whatever is queued next.
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task);
  chain = run.then(
    () => sleep(SPACING_MS),
    () => sleep(SPACING_MS),
  );
  return run;
}

class ArxivError extends Error {
  constructor(
    public status: number,
    public retryAfter: number, // seconds, only meaningful for 429
  ) {
    super(`arXiv HTTP ${status}`);
  }
}

function secondsLeftInBackoff() {
  return Math.ceil((backoffUntil - Date.now()) / 1000);
}

async function fetchPapers(url: string): Promise<Paper[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (res.status === 429) {
    const retryAfter =
      Number(res.headers.get("retry-after")) || DEFAULT_BACKOFF_S;
    backoffUntil = Date.now() + retryAfter * 1000;
    throw new ArxivError(429, retryAfter);
  }
  if (!res.ok) throw new ArxivError(res.status, 0);

  const data = parser.parse(await res.text());
  const entries = data?.feed?.entry ?? [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list
    .filter(Boolean)
    .map(entryToPaper)
    .filter((p) => p.id && p.title);
}

// Fresh cache hit, or a shared in-flight call, or one queued arXiv request.
function getPapers(url: string): Promise<Entry> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return Promise.resolve(hit);

  const pending = inflight.get(url);
  if (pending) return pending;

  if (Date.now() < backoffUntil) {
    return Promise.reject(new ArxivError(429, secondsLeftInBackoff()));
  }

  const run = schedule(async () => {
    // The backoff may have started while this request was waiting in the queue.
    if (Date.now() < backoffUntil) {
      throw new ArxivError(429, secondsLeftInBackoff());
    }
    console.log("arXiv GET", url);
    const entry = { papers: await fetchPapers(url), fetchedAt: Date.now() };
    cache.set(url, entry);
    return entry;
  }).finally(() => inflight.delete(url));

  inflight.set(url, run);
  return run;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const field = fieldById(sp.get("field") ?? "ai-ml");
  const q = (sp.get("q") ?? "").trim();
  const start = Number(sp.get("start") ?? 0);
  const max = Math.min(Number(sp.get("max") ?? 12), 30);

  const catClause = field.cats.map((c) => `cat:${c}`).join("+OR+");
  const searchQuery = q
    ? `(${catClause})+AND+all:${encodeURIComponent(q)}`
    : catClause;

  const url =
    `${ARXIV}?search_query=${searchQuery}` +
    `&start=${start}&max_results=${max}` +
    `&sortBy=submittedDate&sortOrder=descending`;

  try {
    const { papers } = await getPapers(url);
    return NextResponse.json({ papers });
  } catch (err) {
    // Anything we have from before beats an empty screen.
    const stale = cache.get(url);
    if (stale) return NextResponse.json({ papers: stale.papers, stale: true });

    if (err instanceof ArxivError && err.status === 429) {
      return NextResponse.json(
        {
          papers: [],
          error: `arXiv is rate limiting us right now. Try again in about ${err.retryAfter} seconds.`,
          retryAfter: err.retryAfter,
        },
        { status: 503 },
      );
    }

    const cause = (err as any)?.cause;
    const reason =
      err instanceof ArxivError
        ? err.message
        : cause?.code || cause?.message || (err as Error)?.message || String(err);
    console.error("arXiv fetch failed:", reason);
    return NextResponse.json(
      { papers: [], error: `Could not reach arXiv (${reason}). Try again in a moment.` },
      { status: 502 },
    );
  }
}
