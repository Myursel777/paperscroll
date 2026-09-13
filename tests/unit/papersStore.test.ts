import { describe, expect, it, vi } from "vitest";
import { createPapersStore, storeRowToPaper, type StoreRow } from "@/lib/papersStore";

const CONFIG = { url: "https://project.supabase.co", key: "public-key" };

const row = (over: Partial<StoreRow> & { id: string }): StoreRow => ({
  title: `Paper ${over.id}`,
  summary: "An abstract.",
  authors: ["A. Author"],
  published: "2026-09-12T00:00:00Z",
  pdf_link: null,
  primary_category: "cs.LG",
  categories: ["cs.LG"],
  tags: ["llms"],
  popularity: 0,
  ...over,
});

/** A fetch that answers with the given rows and records what it was asked. */
function fakeFetch(rows: StoreRow[] | { status: number }) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    if (Array.isArray(rows)) {
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("nope", { status: rows.status });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe("storeRowToPaper", () => {
  it("maps a stored row onto the shape the feed renders", () => {
    const paper = storeRowToPaper(row({ id: "http://arxiv.org/abs/1v1", pdf_link: "https://arxiv.org/pdf/1v1" }));
    expect(paper.id).toBe("http://arxiv.org/abs/1v1");
    expect(paper.pdfLink).toBe("https://arxiv.org/pdf/1v1");
    expect(paper.primaryCategory).toBe("cs.LG");
    expect(paper.tags).toEqual(["llms"]);
  });

  it("tolerates rows with missing lists", () => {
    const paper = storeRowToPaper({ ...row({ id: "x" }), authors: undefined as never, tags: undefined as never });
    expect(paper.authors).toEqual([]);
    expect(paper.tags).toEqual([]);
  });
});

describe("createPapersStore: the query", () => {
  const store = createPapersStore(CONFIG);
  const parse = (u: string) => new URL(u).searchParams;

  it("asks for one field's papers, newest first", () => {
    const params = parse(store.buildUrl({ cats: ["cs.AI", "cs.LG"], start: 12, max: 12 }));
    expect(params.get("categories")).toBe("ov.{cs.AI,cs.LG}");
    expect(params.get("order")).toBe("published.desc");
    expect(params.get("offset")).toBe("12");
    expect(params.get("limit")).toBe("12");
  });

  it("never asks for the embedding, which the feed does not need", () => {
    expect(parse(store.buildUrl({ cats: ["cs.LG"] })).get("select")).not.toContain("embedding");
  });

  it("searches the title and the abstract", () => {
    const params = parse(store.buildUrl({ cats: ["cs.LG"], q: "diffusion" }));
    expect(params.get("or")).toBe("(title.ilike.*diffusion*,summary.ilike.*diffusion*)");
  });

  it("strips the characters PostgREST would read as syntax", () => {
    // Commas, brackets and stars separate clauses, so a search containing them
    // would otherwise change the meaning of the query.
    const params = parse(store.buildUrl({ cats: ["cs.LG"], q: "graph (neural), *nets*" }));
    expect(params.get("or")).toBe("(title.ilike.*graph neural nets*,summary.ilike.*graph neural nets*)");
  });

  it("leaves the search out when it is blank", () => {
    expect(parse(store.buildUrl({ cats: ["cs.LG"], q: "   " })).get("or")).toBeNull();
  });

  it("keeps the page size sane whatever it is handed", () => {
    expect(parse(store.buildUrl({ cats: [], max: 500 })).get("limit")).toBe("50");
    expect(parse(store.buildUrl({ cats: [], max: 0 })).get("limit")).toBe("1");
    expect(parse(store.buildUrl({ cats: [], start: -5 })).get("offset")).toBe("0");
  });
});

describe("createPapersStore: fetching", () => {
  it("returns papers and sends the public key", async () => {
    const { fn, calls } = fakeFetch([row({ id: "a" }), row({ id: "b" })]);
    const store = createPapersStore({ ...CONFIG, fetch: fn });
    const papers = await store.getPapers({ cats: ["cs.LG"] });
    expect(papers.map((p) => p.id)).toEqual(["a", "b"]);
    expect(calls[0].headers.apikey).toBe("public-key");
    expect(calls[0].headers.Authorization).toBe("Bearer public-key");
  });

  it("is switched off, and silent, with no project configured", async () => {
    const { fn, calls } = fakeFetch([row({ id: "a" })]);
    const store = createPapersStore({ fetch: fn });
    expect(store.enabled).toBe(false);
    expect(await store.getPapers({ cats: ["cs.LG"] })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("returns nothing rather than throwing when the store errors", async () => {
    // This is a fallback for a failed arXiv call. If it threw, it would
    // replace the original error with a less useful one.
    const { fn } = fakeFetch({ status: 500 });
    const log = vi.fn();
    const store = createPapersStore({ ...CONFIG, fetch: fn, log });
    expect(await store.getPapers({ cats: ["cs.LG"] })).toEqual([]);
    expect(log).toHaveBeenCalledOnce();
  });

  it("returns nothing when the connection fails outright", async () => {
    const fn = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const store = createPapersStore({ ...CONFIG, fetch: fn, log: () => {} });
    expect(await store.getPapers({ cats: ["cs.LG"] })).toEqual([]);
  });
});
