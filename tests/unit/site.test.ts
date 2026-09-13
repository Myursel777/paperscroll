import { describe, expect, it } from "vitest";
import { normaliseSiteUrl } from "@/lib/site";

// The root layout passes siteUrl to Next as metadataBase, which parses it with
// `new URL`. A value that cannot be parsed throws during the build, and since
// every page renders inside the root layout it surfaces as "Failed to collect
// page data" on an unrelated page. These cases are the ones that reached a
// real deploy, so they stay covered.
describe("normaliseSiteUrl", () => {
  it("treats an unset or blank value as absent", () => {
    expect(normaliseSiteUrl(undefined)).toBeNull();
    expect(normaliseSiteUrl(null)).toBeNull();
    expect(normaliseSiteUrl("")).toBeNull();
    expect(normaliseSiteUrl("   ")).toBeNull();
  });

  it("fills in https when the scheme was left off", () => {
    // This is the shape Vercel's own VERCEL_URL always takes, and the shape a
    // pasted address usually takes.
    expect(normaliseSiteUrl("paperscroll.vercel.app")).toBe("https://paperscroll.vercel.app");
  });

  it("keeps an address that already has a scheme", () => {
    expect(normaliseSiteUrl("https://paperscroll.app")).toBe("https://paperscroll.app");
    expect(normaliseSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("drops trailing slashes and surrounding space", () => {
    expect(normaliseSiteUrl("  https://paperscroll.app//  ")).toBe("https://paperscroll.app");
  });

  it("keeps a subpath, for a site not served at the root", () => {
    expect(normaliseSiteUrl("https://example.com/papers")).toBe("https://example.com/papers");
  });

  it("rejects a value with no host", () => {
    expect(normaliseSiteUrl("https://")).toBeNull();
  });

  it("produces something new URL accepts, whatever it is given", () => {
    for (const input of ["paperscroll.vercel.app", "https://x.dev/", "  example.com  ", "http://localhost:3000"]) {
      const out = normaliseSiteUrl(input);
      expect(out).not.toBeNull();
      expect(() => new URL(out!)).not.toThrow();
    }
  });
});
