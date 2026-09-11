import { describe, expect, it } from "vitest";
import { MAX_TAGS, scoreTopics, tagPaper, tagPapers } from "@/lib/tagger";

const doc = (title: string, summary = "", categories: string[] = []) => ({
  title,
  summary,
  categories,
  primaryCategory: categories[0] ?? null,
});

describe("rule-based tagger", () => {
  it("tags a paper from its title alone", () => {
    const tags = tagPaper(doc("Scaling laws for instruction-tuned large language models"));
    expect(tags[0]).toBe("llms");
  });

  it("ranks the topic with the strongest evidence first", () => {
    const tags = tagPaper(
      doc(
        "Fast sampling for diffusion models",
        "We speed up denoising diffusion probabilistic models. Experiments use a GAN baseline and a standard optimizer.",
        ["cs.LG"],
      ),
    );
    expect(tags[0]).toBe("generative-models");
  });

  it("never returns more than the maximum number of tags", () => {
    const tags = tagPaper(
      doc(
        "Reinforcement learning with large language models for multimodal graph neural network agents",
        "A benchmark for interpretability, safety, and federated learning of diffusion models on video.",
        ["cs.LG", "cs.AI"],
      ),
    );
    expect(tags.length).toBeLessThanOrEqual(MAX_TAGS);
    expect(tags.length).toBe(MAX_TAGS);
  });

  it("returns nothing for a paper that matches no topic", () => {
    expect(tagPaper(doc("On the combinatorics of tilings", "We count tilings of a rectangle by dominoes."))).toEqual([]);
  });

  it("does not tag on a single word in the abstract, unless the category agrees", () => {
    const abstractOnly = doc("A study of something", "We happen to use a graph neural network once.");
    expect(tagPaper(abstractOnly)).toEqual([]);

    const withCategory = doc("A study of something", "We happen to use a graph neural network once.", ["cs.LG"]);
    expect(tagPaper(withCategory)).toEqual(["graph-learning"]);
  });

  it("never tags on a category alone", () => {
    expect(tagPaper(doc("Untitled", "No relevant words here.", ["cs.CV", "cs.RO", "q-bio.NC"]))).toEqual([]);
  });

  it("skips gated topics when the paper is outside their categories", () => {
    // "replay" is a memory term in neuroscience and a GPU term elsewhere.
    const gpu = doc("Faster solvers via CUDA graph replay", "", ["cs.LG"]);
    expect(tagPaper(gpu)).not.toContain("learning-memory");
    const neuro = doc("Hippocampal replay during sleep", "", ["q-bio.NC"]);
    expect(tagPaper(neuro)).toContain("learning-memory");
  });

  it("lets a topic demand a higher score than the default", () => {
    // One mention of "benchmark" in an abstract is not a benchmark paper...
    expect(tagPaper(doc("A new optimizer", "We evaluate on standard benchmarks.", ["cs.LG"]))).not.toContain("benchmarks");
    // ...but a benchmark in the title is.
    expect(tagPaper(doc("A benchmark for long-context reading", "", ["cs.CL"]))).toContain("benchmarks");
  });

  it("explains each tag with the patterns that matched", () => {
    const [best] = scoreTopics(doc("Conformal prediction under distribution shift", "", ["stat.ML"]));
    expect(best.id).toBe("uncertainty");
    expect(best.hits.length).toBeGreaterThanOrEqual(2);
    expect(best.score).toBeGreaterThanOrEqual(6);
  });

  it("fills in tags for a list of papers without dropping fields", () => {
    const out = tagPapers([{ ...doc("Neural radiance fields for 3D scenes"), extra: 1 }]);
    expect(out[0].tags).toEqual(["3d-vision"]);
    expect(out[0].extra).toBe(1);
  });
});
