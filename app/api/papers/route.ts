import { NextRequest, NextResponse } from "next/server";
import { fieldById } from "@/lib/arxiv";
import { ArxivError, buildQueryUrl, createArxivClient } from "@/lib/arxivClient";
import { createRateLimiter } from "@/lib/rateLimit";
import { neuralTagger } from "@/lib/neuralTagger";
import { papersStore } from "@/lib/papersStore";

// GET /api/papers?field=ai-ml&q=&start=0&max=12
//
// Thin proxy in front of arXiv. All the care about not hammering arXiv lives
// in lib/arxivClient.ts; this file only parses the request, applies the
// per-visitor throttle, picks a source, and shapes the JSON reply.
//
// Three sources, in order of freshness:
//   1. arXiv itself, live or from this instance's ten-minute cache;
//   2. that cache after it has expired, when arXiv has stopped answering;
//   3. the nightly paper store in the database (lib/papersStore.ts).
// The third exists because arXiv refuses requests now and then, and the
// client then stops calling it for a minute. On a serverless host that minute
// costs a visitor the whole feed, since a fresh instance has nothing cached.
// The store holds recent papers with their topics already computed, so a
// reader sees papers up to a day old instead of an error.
//
// Every paper carries `tags`: topic ids from the embedding tagger when the
// Python service is configured and reachable, from lib/tagger.ts otherwise,
// and from the nightly job for stored papers.
//   { papers }                            normal
//   { papers, stale: true, source }       arXiv failed; "cache" or "store"
//   { papers: [], error, retryAfter }     nothing anywhere (HTTP 429/502/503)

const arxiv = createArxivClient(); // one per server process, shared by all visitors

// A real reader switches fields or scrolls a page every few seconds at most.
const limiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

function visitorKey(req: NextRequest) {
  // Vercel (and most proxies) put the real client address here.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "local";
}

export async function GET(req: NextRequest) {
  const { allowed, retryAfter } = limiter.check(visitorKey(req));
  if (!allowed) {
    return NextResponse.json(
      { papers: [], error: "Too many requests from this device. Give it a moment.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const sp = req.nextUrl.searchParams;
  const field = fieldById(sp.get("field") ?? "ai-ml");
  const q = sp.get("q") ?? "";
  const start = Number(sp.get("start") ?? 0);
  const max = Math.min(Number(sp.get("max") ?? 12), 30);
  const url = buildQueryUrl({ cats: field.cats, q, start, max });

  try {
    const { papers: raw, stale } = await arxiv.getPapers(url);
    const papers = await neuralTagger.tagPapersBest(raw);
    return NextResponse.json(stale ? { papers, stale: true, source: "cache" } : { papers });
  } catch (err) {
    // arXiv could not answer and this instance had nothing cached for the
    // query. The store usually can, and its papers are already tagged.
    const stored = await papersStore.getPapers({ cats: field.cats, q, start, max });
    if (stored.length > 0) {
      return NextResponse.json({ papers: stored, stale: true, source: "store" });
    }

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

    const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
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
