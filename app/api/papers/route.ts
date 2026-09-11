import { NextRequest, NextResponse } from "next/server";
import { fieldById } from "@/lib/arxiv";
import { ArxivError, buildQueryUrl, createArxivClient } from "@/lib/arxivClient";
import { createRateLimiter } from "@/lib/rateLimit";

// GET /api/papers?field=ai-ml&q=&start=0&max=12
//
// Thin proxy in front of arXiv. All the care about not hammering arXiv lives
// in lib/arxivClient.ts; this file only parses the request, applies the
// per-visitor throttle, and shapes the JSON reply:
//   { papers }                        normal
//   { papers, stale: true }           arXiv failed, expired cache served
//   { papers: [], error, retryAfter } nothing to show (HTTP 429/502/503)

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
  const url = buildQueryUrl({
    cats: field.cats,
    q: sp.get("q") ?? "",
    start: Number(sp.get("start") ?? 0),
    max: Math.min(Number(sp.get("max") ?? 12), 30),
  });

  try {
    const { papers, stale } = await arxiv.getPapers(url);
    return NextResponse.json(stale ? { papers, stale: true } : { papers });
  } catch (err) {
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
