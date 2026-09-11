import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { entryToPaper, fieldById, type Paper } from "@/lib/arxiv";

const ARXIV = "https://export.arxiv.org/api/query";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// arXiv rate-limits bursts (HTTP 429). We push every outgoing call through a
// single queue so they go one at a time, spaced out, instead of all at once.
const SPACING_MS = 1500;
let chain: Promise<unknown> = Promise.resolve();

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const result = await task();
    await sleep(SPACING_MS);
    return result;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run as Promise<T>;
}

// If arXiv still says 429, wait (honouring Retry-After) and try again.
async function fetchArxiv(url: string): Promise<Response> {
  const headers = { "User-Agent": "PaperScroll/0.1 (student project)" };
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.status !== 429) return res;
    const wait = Number(res.headers.get("retry-after")) || 3 * (attempt + 1);
    await sleep(wait * 1000);
  }
  return fetch(url, { headers, cache: "no-store" });
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
    const res = await schedule(() => fetchArxiv(url));
    if (!res.ok) {
      console.error("arXiv HTTP error", res.status);
      return NextResponse.json(
        {
          papers: [],
          error: `arXiv is busy (HTTP ${res.status}). Wait a moment and try again.`,
        },
        { status: 502 },
      );
    }

    const xml = await res.text();
    const data = parser.parse(xml);
    const entries = data?.feed?.entry ?? [];
    const list = Array.isArray(entries) ? entries : [entries];

    const papers: Paper[] = list
      .filter(Boolean)
      .map(entryToPaper)
      .filter((p) => p.id && p.title);

    return NextResponse.json({ papers });
  } catch (err) {
    const cause = (err as any)?.cause;
    const reason =
      cause?.code || cause?.message || (err as Error)?.message || String(err);
    console.error("arXiv fetch failed. Reason:", reason);
    return NextResponse.json(
      { papers: [], error: `Could not reach arXiv: ${reason}` },
      { status: 502 },
    );
  }
}