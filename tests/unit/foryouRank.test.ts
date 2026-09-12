import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/foryou/events";
import { topicProfile } from "@/lib/foryou/profile";
import { EXPLORE_EVERY, rankForYou, reasonText, type Candidate } from "@/lib/foryou/rank";
import { paper } from "./fixtures";

const NOW = Date.parse("2026-09-12T12:00:00Z");
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();

const cand = (id: string, over: Partial<Candidate> & { tags?: string[]; published?: string } = {}): Candidate => ({
  paper: paper({ id, tags: over.tags ?? [], published: over.published ?? daysAgo(0) }),
  similarity: over.similarity ?? 0,
  popularity: over.popularity,
});

const profileFor = (tags: string[]) =>
  topicProfile({ events: [makeEvent("save", { id: "seed", tags }, null, daysAgo(0))], now: NOW });

describe("rankForYou", () => {
  it("never shows hidden or excluded papers, and drops duplicates", () => {
    const profile = profileFor([]);
    const out = rankForYou([cand("a"), cand("a"), cand("hidden"), cand("saved")], {
      profile,
      hidden: new Set(["hidden"]),
      exclude: new Set(["saved"]),
      now: NOW,
    });
    expect(out.map((r) => r.paper.id)).toEqual(["a"]);
  });

  it("puts papers about the reader's topics first", () => {
    const profile = profileFor(["llms"]);
    const out = rankForYou([cand("other", { tags: ["gnns"] }), cand("mine", { tags: ["llms"] })], { profile, now: NOW });
    expect(out[0].paper.id).toBe("mine");
    expect(out[0].reason).toEqual({ kind: "topic", topicId: "llms" });
  });

  it("prefers content similarity when it is the strongest part", () => {
    const profile = profileFor([]);
    const out = rankForYou([cand("far", { similarity: 0.1 }), cand("near", { similarity: 0.9 })], { profile, now: NOW });
    expect(out[0].paper.id).toBe("near");
    expect(out[0].reason.kind).toBe("similar");
  });

  it("falls back to recency in a cold start", () => {
    const profile = topicProfile({ events: [], now: NOW });
    const out = rankForYou([cand("old", { published: daysAgo(20) }), cand("new", { published: daysAgo(0) })], { profile, now: NOW });
    expect(out.map((r) => r.paper.id)).toEqual(["new", "old"]);
    expect(out[0].reason.kind).toBe("fresh");
  });

  it("says 'interest' for topics the reader picked but has not read about yet", () => {
    const profile = topicProfile({ events: [], interests: ["3d-vision"], now: NOW });
    const out = rankForYou([cand("a", { tags: ["3d-vision"] })], { profile, now: NOW });
    expect(out[0].reason).toEqual({ kind: "interest", topicId: "3d-vision" });
    expect(reasonText(out[0].reason)).toBe("Matches your interest in 3D vision");
  });

  it("lowers papers the reader has already seen", () => {
    const profile = profileFor([]);
    const out = rankForYou([cand("seen"), cand("fresh")], { profile, seen: new Map([["seen", 2]]), now: NOW });
    expect(out.map((r) => r.paper.id)).toEqual(["fresh", "seen"]);
    expect(out[1].parts.novelty).toBeCloseTo(0.5);
  });

  it("uses popularity when nothing else separates candidates", () => {
    const profile = profileFor([]);
    // Both three weeks old, so recency does not outweigh popularity.
    const out = rankForYou(
      [cand("quiet", { popularity: 0, published: daysAgo(21) }), cand("loved", { popularity: 1, published: daysAgo(21) })],
      { profile, now: NOW },
    );
    expect(out[0].paper.id).toBe("loved");
    expect(out[0].reason.kind).toBe("popular");
  });

  it("spreads topics out instead of stacking one theme", () => {
    // The reader likes both topics; four LLM papers score a little higher
    // than the one agents paper.
    const profile = profileFor(["llms", "ai-agents"]);
    const cands = [
      ...["l1", "l2", "l3", "l4"].map((id) => cand(id, { tags: ["llms"], similarity: 0.5 })),
      cand("a1", { tags: ["ai-agents"], similarity: 0.45 }),
    ];
    const out = rankForYou(cands, { profile, now: NOW, explore: false });
    // Without diversity every LLM paper would come first; the penalty for a
    // repeated first topic lets the agents paper in at second place.
    expect(out.map((r) => r.paper.id)).toEqual(["l1", "a1", "l2", "l3", "l4"]);
  });

  it("reserves every EXPLORE_EVERY-th slot for something outside the top topics", () => {
    const profile = profileFor(["llms"]);
    const cands = [
      ...Array.from({ length: 10 }, (_, i) => cand(`l${i}`, { tags: ["llms"], similarity: 0.9 })),
      cand("outside", { tags: ["gnns"], similarity: 0.1 }),
    ];
    const out = rankForYou(cands, { profile, now: NOW, random: () => 0 });
    expect(out[EXPLORE_EVERY - 1].paper.id).toBe("outside");
    expect(out[EXPLORE_EVERY - 1].reason.kind).toBe("explore");
    expect(reasonText(out[EXPLORE_EVERY - 1].reason)).toBe("Something different");
  });

  it("skips exploration when there is nothing outside the profile", () => {
    const profile = profileFor(["llms"]);
    const cands = Array.from({ length: 8 }, (_, i) => cand(`l${i}`, { tags: ["llms"] }));
    const out = rankForYou(cands, { profile, now: NOW });
    expect(out.every((r) => r.reason.kind !== "explore")).toBe(true);
    expect(out).toHaveLength(8);
  });
});
