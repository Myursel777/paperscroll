import { describe, expect, it } from "vitest";
import { contentVector } from "@/lib/foryou/candidates";
import { popularityScores } from "../../scripts/nightly/upload";

describe("contentVector", () => {
  it("returns null when there is nothing to average", () => {
    expect(contentVector([])).toBeNull();
    expect(contentVector([{ vec: [1, 0], weight: 0 }])).toBeNull();
  });

  it("averages unit vectors and normalises the result", () => {
    const v = contentVector([
      { vec: [1, 0], weight: 1 },
      { vec: [0, 1], weight: 1 },
    ])!;
    expect(v[0]).toBeCloseTo(Math.SQRT1_2);
    expect(v[1]).toBeCloseTo(Math.SQRT1_2);
    expect(Math.hypot(...v)).toBeCloseTo(1);
  });

  it("leans towards the heavier paper", () => {
    const v = contentVector([
      { vec: [1, 0], weight: 3 },
      { vec: [0, 1], weight: 1 },
    ])!;
    expect(v[0]).toBeGreaterThan(v[1]);
    expect(Math.hypot(...v)).toBeCloseTo(1);
  });

  it("ignores vectors of the wrong width", () => {
    const v = contentVector([
      { vec: [1, 0], weight: 1 },
      { vec: [0, 1, 0], weight: 5 },
    ])!;
    expect(v).toEqual([1, 0]);
  });
});

describe("popularityScores", () => {
  it("weights saves above reads above expands, scaled to the busiest paper", () => {
    const scores = popularityScores([
      { paper_id: "a", type: "save" },
      { paper_id: "a", type: "read" },
      { paper_id: "b", type: "expand" },
      { paper_id: "c", type: "impression" },
    ]);
    expect(scores.get("a")).toBe(1);
    expect(scores.get("b")).toBeCloseTo(0.2);
    expect(scores.has("c")).toBe(false);
  });

  it("is empty when nothing counted", () => {
    expect(popularityScores([]).size).toBe(0);
    expect(popularityScores([{ paper_id: "a", type: "impression" }]).size).toBe(0);
  });
});
