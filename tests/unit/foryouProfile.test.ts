import { describe, expect, it } from "vitest";
import { hiddenPaperIds, makeEvent, mergeEvents, trimEvents, withoutHide, type ReadingEvent } from "@/lib/foryou/events";
import {
  affinity,
  bestTopic,
  decay,
  dwellWeight,
  HALF_LIFE_DAYS,
  INTEREST_PRIOR,
  positivePapers,
  seenCounts,
  topicProfile,
} from "@/lib/foryou/profile";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-12T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();

const ev = (type: ReadingEvent["type"], id: string, tags: string[], at = daysAgo(0), value: number | null = null) =>
  makeEvent(type, { id, tags }, value, at);

describe("decay", () => {
  it("halves every HALF_LIFE_DAYS", () => {
    expect(decay(0)).toBe(1);
    expect(decay(HALF_LIFE_DAYS * DAY)).toBeCloseTo(0.5, 6);
    expect(decay(2 * HALF_LIFE_DAYS * DAY)).toBeCloseTo(0.25, 6);
  });
});

describe("dwellWeight", () => {
  it("ignores a glance and saturates at thirty seconds", () => {
    expect(dwellWeight(1000)).toBe(0);
    expect(dwellWeight(16_000)).toBeCloseTo(0.5, 2);
    expect(dwellWeight(60_000)).toBe(1);
    expect(dwellWeight(null)).toBe(0);
  });
});

describe("topicProfile", () => {
  it("adds event weights to every tag of the paper", () => {
    const p = topicProfile({ events: [ev("save", "a", ["llms", "agents"])], now: NOW });
    expect(p.weights.llms).toBeCloseTo(3);
    expect(p.weights.agents).toBeCloseTo(3);
    expect(p.evidence).toBe(1);
    expect(p.top.map((t) => t.id)).toEqual(["llms", "agents"]);
  });

  it("counts a fresh event twice as much as one from a month ago", () => {
    const p = topicProfile({ events: [ev("read", "a", ["llms"]), ev("read", "b", ["agents"], daysAgo(30))], now: NOW });
    expect(p.weights.llms / p.weights.agents).toBeCloseTo(2, 2);
  });

  it("lets not interested pull a topic below zero, and ignores impressions", () => {
    const p = topicProfile({
      events: [ev("impression", "a", ["llms"]), ev("not_interested", "b", ["llms"]), ev("expand", "c", ["llms"])],
      now: NOW,
    });
    expect(p.weights.llms).toBeCloseTo(-2);
    expect(p.top).toEqual([]);
    expect(p.evidence).toBe(2);
  });

  it("uses interests as a prior that does not fade", () => {
    const p = topicProfile({ events: [], interests: ["3d-vision"], now: NOW });
    expect(p.weights["3d-vision"]).toBe(INTEREST_PRIOR);
    expect(p.evidence).toBe(0);
    expect(p.fromInterests.has("3d-vision")).toBe(true);
  });

  it("marks an interest as evidenced once the reader has read about it", () => {
    const p = topicProfile({ events: [ev("read", "a", ["3d-vision"])], interests: ["3d-vision"], now: NOW });
    expect(p.fromInterests.has("3d-vision")).toBe(false);
    expect(p.weights["3d-vision"]).toBeCloseTo(2 + INTEREST_PRIOR);
  });

  it("applies sliders: 2 doubles and adds a prior, 0 turns a topic against", () => {
    const events = [ev("save", "a", ["llms"])];
    const up = topicProfile({ events, boosts: { llms: 2 }, now: NOW });
    const down = topicProfile({ events, boosts: { llms: 0 }, now: NOW });
    const unknown = topicProfile({ events, boosts: { agents: 2 }, now: NOW });
    expect(up.weights.llms).toBeCloseTo(6 + INTEREST_PRIOR);
    expect(down.weights.llms).toBeCloseTo(-INTEREST_PRIOR);
    expect(unknown.weights.agents).toBeCloseTo(INTEREST_PRIOR);
  });

  it("clamps out-of-range slider values", () => {
    const p = topicProfile({ events: [], boosts: { llms: 9, agents: -4, other: Number.NaN }, now: NOW });
    expect(p.weights.llms).toBeCloseTo(INTEREST_PRIOR);
    expect(p.weights.agents).toBeCloseTo(-INTEREST_PRIOR);
    expect(p.weights.other).toBeUndefined();
  });
});

describe("affinity and bestTopic", () => {
  const profile = topicProfile({ events: [ev("save", "a", ["llms"]), ev("not_interested", "b", ["gnns"])], now: NOW });

  it("is 1 for the strongest topic, negative for a turned-down one, 0 for untagged papers", () => {
    expect(affinity(profile, ["llms"])).toBeCloseTo(1);
    expect(affinity(profile, ["gnns"])).toBeCloseTo(-1);
    expect(affinity(profile, [])).toBe(0);
    expect(affinity(profile, ["unknown"])).toBe(0);
  });

  it("averages over a paper's tags", () => {
    expect(affinity(profile, ["llms", "unknown"])).toBeCloseTo(0.5);
  });

  it("names the best matching topic, or null when nothing matches", () => {
    expect(bestTopic(profile, ["unknown", "llms"])).toBe("llms");
    expect(bestTopic(profile, ["gnns"])).toBeNull();
  });
});

describe("positivePapers and seenCounts", () => {
  it("sums decayed positive weight per paper and leaves out disliked ones", () => {
    const list = positivePapers(
      [ev("save", "a", []), ev("expand", "a", []), ev("read", "b", []), ev("not_interested", "c", []), ev("read", "c", [])],
      NOW,
    );
    expect(list.map((p) => p.id)).toEqual(["a", "b"]);
    expect(list[0].weight).toBeCloseTo(4);
  });

  it("counts impressions in the recent window only", () => {
    const seen = seenCounts([ev("impression", "a", []), ev("impression", "a", []), ev("impression", "b", [], daysAgo(20))], NOW);
    expect(seen.get("a")).toBe(2);
    expect(seen.has("b")).toBe(false);
  });
});

describe("event lists", () => {
  it("trims old events and caps the list, newest first", () => {
    const events = [ev("read", "old", [], daysAgo(61)), ev("read", "b", [], daysAgo(1)), ev("read", "a", [], daysAgo(0))];
    expect(trimEvents(events, NOW).map((e) => e.paperId)).toEqual(["a", "b"]);
  });

  it("merges without duplicates", () => {
    const a = ev("read", "x", [], daysAgo(1));
    const b = ev("save", "y", [], daysAgo(0));
    expect(mergeEvents([a], [a, b]).map((e) => e.paperId)).toEqual(["y", "x"]);
  });

  it("derives hidden papers and can undo a hide", () => {
    const events = [ev("not_interested", "h", []), ev("read", "r", [])];
    expect([...hiddenPaperIds(events)]).toEqual(["h"]);
    expect(hiddenPaperIds(withoutHide(events, "h")).size).toBe(0);
  });
});
