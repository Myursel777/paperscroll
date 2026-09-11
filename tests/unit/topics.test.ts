import { describe, expect, it } from "vitest";
import { FIELDS } from "@/lib/arxiv";
import { TOPICS, topicById, topicsForField } from "@/lib/topics";

// Keeps the taxonomy well-formed as it grows.
describe("topic taxonomy", () => {
  it("has unique kebab-case ids", () => {
    const ids = TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("points every topic at an existing field, and every field has topics", () => {
    const fieldIds = new Set(FIELDS.map((f) => f.id));
    for (const t of TOPICS) expect(fieldIds.has(t.field), `${t.id} -> ${t.field}`).toBe(true);
    for (const f of FIELDS) expect(topicsForField(f.id).length, f.id).toBeGreaterThanOrEqual(3);
  });

  it("has a label, description, query, categories, and patterns on every topic", () => {
    for (const t of TOPICS) {
      expect(t.label.length, t.id).toBeGreaterThan(2);
      expect(t.description.length, t.id).toBeGreaterThan(30);
      expect(t.query.trim().length, t.id).toBeGreaterThan(1);
      expect(t.cats.length, t.id).toBeGreaterThan(0);
      expect(t.patterns.length, t.id).toBeGreaterThan(0);
    }
  });

  it("only uses patterns that compile as case-insensitive regular expressions", () => {
    for (const t of TOPICS) {
      for (const p of t.patterns) expect(() => new RegExp(p, "i"), `${t.id}: ${p}`).not.toThrow();
    }
  });

  it("uses arXiv-style category ids", () => {
    for (const t of TOPICS) for (const c of t.cats) expect(c, t.id).toMatch(/^[a-z-]+(\.[A-Za-z-]+)?$/);
  });

  it("looks topics up by id", () => {
    expect(topicById("llms")?.label).toBe("Large language models");
    expect(topicById("nope")).toBeUndefined();
  });
});
