import { describe, expect, it, vi } from "vitest";
import { createNeuralTagger } from "@/lib/neuralTagger";
import { paper } from "./fixtures";

const nerf = paper({ id: "a", title: "Neural radiance fields for 3D scenes", categories: ["cs.CV"], primaryCategory: "cs.CV" });
const plain = paper({ id: "b", title: "A paper about nothing in particular", summary: "No topic words here." });

function harness(reply: (body: any) => Response | Promise<Response>) {
  const calls: any[] = [];
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    return reply(body);
  });
  const tagger = createNeuralTagger({ url: "http://svc.test/", fetch: fetch as unknown as typeof globalThis.fetch, log: () => {} });
  return { tagger, calls };
}

describe("neural tagger client", () => {
  it("does nothing without a service URL and leaves the rules in charge", async () => {
    const tagger = createNeuralTagger({ fetch: vi.fn() as unknown as typeof globalThis.fetch });
    expect(await tagger.tagNeural([nerf])).toBeNull();
    const [tagged] = await tagger.tagPapersBest([nerf]);
    expect(tagged.tags).toEqual(["3d-vision"]);
  });

  it("sends the taxonomy and the papers, and uses the service's tags", async () => {
    const { tagger, calls } = harness((body) =>
      new Response(JSON.stringify(body.candidates.map((c: any) => ({ id: c.id, tags: [{ id: "generative-models", similarity: 0.5 }] })))),
    );
    const out = await tagger.tagPapersBest([nerf]);
    expect(out[0].tags).toEqual(["generative-models"]);
    expect(calls[0].topics.length).toBeGreaterThan(50);
    expect(calls[0].topics[0]).toHaveProperty("text");
    expect(calls[0].candidates[0].text).toContain("Neural radiance fields");
    expect(calls[0].max_tags).toBe(3);
  });

  it("asks the service only about papers it has not tagged before", async () => {
    const { tagger, calls } = harness((body) =>
      new Response(JSON.stringify(body.candidates.map((c: any) => ({ id: c.id, tags: [{ id: "video", similarity: 0.4 }] })))),
    );
    await tagger.tagPapersBest([nerf]);
    await tagger.tagPapersBest([nerf, plain]);
    expect(calls).toHaveLength(2);
    expect(calls[1].candidates.map((c: any) => c.id)).toEqual(["b"]);
  });

  it("falls back to the rules when the service fails or times out", async () => {
    const { tagger } = harness(() => new Response("", { status: 500 }));
    const out = await tagger.tagPapersBest([nerf]);
    expect(out[0].tags).toEqual(["3d-vision"]);

    const slow = createNeuralTagger({
      url: "http://svc.test",
      timeoutMs: 10,
      log: () => {},
      fetch: ((_: any, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof globalThis.fetch,
    });
    const late = await slow.tagPapersBest([nerf]);
    expect(late[0].tags).toEqual(["3d-vision"]);
  });

  it("keeps the rule-based tags for papers the service returned nothing for", async () => {
    const { tagger } = harness((body) => new Response(JSON.stringify(body.candidates.map((c: any) => ({ id: c.id, tags: [] })))));
    const out = await tagger.tagPapersBest([nerf, plain]);
    expect(out[0].tags).toEqual(["3d-vision"]);
    expect(out[1].tags).toEqual([]);
  });
});
