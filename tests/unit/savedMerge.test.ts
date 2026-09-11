import { describe, expect, it } from "vitest";
import { mergeSaved, normaliseSaved, type SavedPaper } from "@/lib/saved/merge";
import { paper } from "./fixtures";

const saved = (id: string, savedAt: string): SavedPaper => ({ ...paper({ id }), savedAt });

describe("mergeSaved", () => {
  it("keeps everything from both sides, newest first, and marks browser-only papers for upload", () => {
    const local = [saved("a", "2026-09-01T00:00:00Z"), saved("b", "2026-09-03T00:00:00Z")];
    const remote = [saved("b", "2026-09-02T00:00:00Z"), saved("c", "2026-09-04T00:00:00Z")];

    const { merged, toUpload } = mergeSaved(local, remote);
    expect(merged.map((p) => p.id)).toEqual(["c", "b", "a"]);
    expect(toUpload.map((p) => p.id)).toEqual(["a"]);
  });

  it("prefers the account's copy when both sides have a paper", () => {
    const local = [{ ...saved("b", "2026-09-03T00:00:00Z"), collectionId: null }];
    const remote = [{ ...saved("b", "2026-09-02T00:00:00Z"), collectionId: "col-1" }];
    const { merged } = mergeSaved(local, remote);
    expect(merged[0].collectionId).toBe("col-1");
  });

  it("handles an empty side", () => {
    const only = [saved("a", "2026-09-01T00:00:00Z")];
    expect(mergeSaved(only, []).toUpload).toHaveLength(1);
    expect(mergeSaved([], only).toUpload).toHaveLength(0);
    expect(mergeSaved([], []).merged).toEqual([]);
  });
});

describe("normaliseSaved", () => {
  it("drops duplicate ids and sorts newest first", () => {
    const list = [saved("a", "2026-09-01T00:00:00Z"), saved("b", "2026-09-05T00:00:00Z"), saved("a", "2026-09-09T00:00:00Z")];
    expect(normaliseSaved(list).map((p) => `${p.id}@${p.savedAt.slice(8, 10)}`)).toEqual(["b@05", "a@01"]);
  });
});
