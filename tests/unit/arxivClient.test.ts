import { describe, expect, it, vi } from "vitest";
import {
  ArxivError,
  CACHE_TTL_MS,
  SPACING_MS,
  buildQueryUrl,
  createArxivClient,
} from "@/lib/arxivClient";
import { atomFeed } from "./fixtures";

// A client wired to a fake clock, an instant sleep that records how long it
// was asked to wait, and a fetch whose reply we control per test.
function harness() {
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const calls: string[] = [];
  let reply: (url: string) => Response | Promise<Response> = () =>
    new Response(atomFeed(["1", "2"]), { status: 200 });

  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return reply(url);
  });

  const client = createArxivClient({
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    log: () => {},
  });

  return {
    client,
    calls,
    sleeps,
    advance: (ms: number) => (clock += ms),
    setReply: (r: typeof reply) => (reply = r),
  };
}

const URL_A = buildQueryUrl({ cats: ["cs.AI"] });
const URL_B = buildQueryUrl({ cats: ["cs.CL"] });

describe("buildQueryUrl", () => {
  it("joins categories with OR and encodes the search", () => {
    const url = buildQueryUrl({ cats: ["cs.AI", "cs.LG"], q: "graph neural", start: 12, max: 20 });
    expect(url).toContain("search_query=(cat:cs.AI+OR+cat:cs.LG)+AND+all:graph%20neural");
    expect(url).toContain("start=12&max_results=20");
  });
});

describe("arXiv client", () => {
  it("parses the feed into papers", async () => {
    const h = harness();
    const { papers, stale } = await h.client.getPapers(URL_A);
    expect(stale).toBe(false);
    expect(papers.map((p) => p.title)).toEqual(["Paper 1", "Paper 2"]);
    expect(papers[0].pdfLink).toBe("http://arxiv.org/pdf/1");
    expect(papers[0].primaryCategory).toBe("cs.AI");
  });

  it("handles a feed with a single entry (parsed as an object, not an array)", async () => {
    const h = harness();
    h.setReply(() => new Response(atomFeed(["only"])));
    const { papers } = await h.client.getPapers(URL_A);
    expect(papers).toHaveLength(1);
  });

  it("serves repeat requests from the cache without calling arXiv", async () => {
    const h = harness();
    await h.client.getPapers(URL_A);
    h.advance(CACHE_TTL_MS - 1);
    await h.client.getPapers(URL_A);
    expect(h.calls).toHaveLength(1);
  });

  it("refetches once the cache entry has expired", async () => {
    const h = harness();
    await h.client.getPapers(URL_A);
    h.advance(CACHE_TTL_MS + 1);
    await h.client.getPapers(URL_A);
    expect(h.calls).toHaveLength(2);
  });

  it("shares one arXiv call between identical requests in flight", async () => {
    const h = harness();
    await Promise.all([h.client.getPapers(URL_A), h.client.getPapers(URL_A)]);
    expect(h.calls).toHaveLength(1);
  });

  it("sends one request at a time and spaces them", async () => {
    const h = harness();
    let releaseFirst: () => void = () => {};
    h.setReply((url) =>
      url === URL_A
        ? new Promise<Response>((resolve) => {
            releaseFirst = () => resolve(new Response(atomFeed(["a"])));
          })
        : new Response(atomFeed(["b"])),
    );

    const first = h.client.getPapers(URL_A);
    const second = h.client.getPapers(URL_B);
    await Promise.resolve();
    expect(h.calls).toEqual([URL_A]); // second has not been sent yet

    releaseFirst();
    await first;
    await second;
    expect(h.calls).toEqual([URL_A, URL_B]);
    expect(h.sleeps).toContain(SPACING_MS); // the gap between them
  });

  it("serves the expired cache entry when arXiv answers 429", async () => {
    const h = harness();
    const fresh = await h.client.getPapers(URL_A);
    h.advance(CACHE_TTL_MS + 1);
    h.setReply(() => new Response("", { status: 429 }));

    const result = await h.client.getPapers(URL_A);
    expect(result.stale).toBe(true);
    expect(result.papers).toEqual(fresh.papers);
  });

  it("throws on 429 with nothing cached, honouring Retry-After, and backs off", async () => {
    const h = harness();
    h.setReply(() => new Response("", { status: 429, headers: { "Retry-After": "30" } }));

    const err = await h.client.getPapers(URL_A).catch((e) => e);
    expect(err).toBeInstanceOf(ArxivError);
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(30);

    // During the backoff a different query is refused without touching arXiv.
    h.advance(10_000);
    const again = await h.client.getPapers(URL_B).catch((e) => e);
    expect(again).toBeInstanceOf(ArxivError);
    expect(again.retryAfter).toBe(20);
    expect(h.calls).toHaveLength(1);

    // After the backoff calls resume.
    h.advance(21_000);
    h.setReply(() => new Response(atomFeed(["ok"])));
    const { papers } = await h.client.getPapers(URL_B);
    expect(papers).toHaveLength(1);
    expect(h.calls).toHaveLength(2);
  });

  it("reports other HTTP errors with their status", async () => {
    const h = harness();
    h.setReply(() => new Response("", { status: 500 }));
    const err = await h.client.getPapers(URL_A).catch((e) => e);
    expect(err).toBeInstanceOf(ArxivError);
    expect(err.status).toBe(500);
  });
});
