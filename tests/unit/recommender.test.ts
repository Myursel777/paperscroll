import { describe, expect, it } from "vitest";
import { recencyScore, recommend, similarTo } from "@/lib/recommender";
import { paper } from "./fixtures";

const today = new Date().toISOString();
const lastMonth = new Date(Date.now() - 30 * 86_400_000).toISOString();

describe("recencyScore", () => {
  it("is about 1 for a paper published today and decays over a month", () => {
    expect(recencyScore(today)).toBeGreaterThan(0.99);
    expect(recencyScore(lastMonth)).toBeCloseTo(Math.exp(-1), 2);
    expect(recencyScore("not a date")).toBe(0);
  });
});

describe("recommend", () => {
  it("falls back to newest-first when nothing is saved (cold start)", () => {
    const old = paper({ id: "old", published: lastMonth });
    const fresh = paper({ id: "fresh", published: today });
    const ranked = recommend([], [old, fresh]);
    expect(ranked.map((s) => s.paper.id)).toEqual(["fresh", "old"]);
    expect(ranked.every((s) => s.similarity === 0)).toBe(true);
  });

  it("never recommends a paper that is already saved", () => {
    const saved = paper({ id: "s", summary: "diffusion models for images" });
    const ranked = recommend([saved], [saved, paper({ id: "x", summary: "anything" })]);
    expect(ranked.map((s) => s.paper.id)).toEqual(["x"]);
  });

  it("ranks papers that share vocabulary with the saved ones higher", () => {
    const saved = [
      paper({ id: "s1", title: "Diffusion models", summary: "denoising diffusion for image generation" }),
      paper({ id: "s2", title: "Score matching", summary: "diffusion probabilistic models generate images" }),
    ];
    const onTopic = paper({ id: "on", title: "Fast diffusion sampling", summary: "image generation with diffusion" });
    const offTopic = paper({ id: "off", title: "Robot grasping", summary: "manipulation with tactile sensors" });

    const ranked = recommend(saved, [offTopic, onTopic]);
    expect(ranked[0].paper.id).toBe("on");
    expect(ranked[0].similarity).toBeGreaterThan(ranked[1].similarity);
  });
});

describe("similarTo", () => {
  it("excludes the seed and puts the closest paper first", () => {
    const seed = paper({ id: "seed", title: "Graph neural networks", summary: "message passing on graphs" });
    const close = paper({ id: "close", title: "Graph attention", summary: "attention for message passing on graphs" });
    const far = paper({ id: "far", title: "Speech recognition", summary: "acoustic modelling with transformers" });

    const ranked = similarTo(seed, [far, seed, close]);
    expect(ranked.map((s) => s.paper.id)).toEqual(["close", "far"]);
  });
});
