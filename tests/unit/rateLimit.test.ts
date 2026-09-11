import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rateLimit";

describe("rate limiter", () => {
  it("allows up to the limit inside the window, then refuses with a wait time", () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => clock });

    expect(limiter.check("a").allowed).toBe(true);
    clock += 1_000;
    expect(limiter.check("a").allowed).toBe(true);
    clock += 1_000;
    expect(limiter.check("a").allowed).toBe(true);

    const refused = limiter.check("a");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfter).toBe(58); // until the oldest hit leaves the window
  });

  it("lets requests through again once old hits fall out of the window", () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: () => clock });
    limiter.check("a");
    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    clock += 10_001;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("keeps visitors independent", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });
});
