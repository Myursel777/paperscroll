// A small per-visitor rate limiter for the API route.
//
// The arXiv budget is shared by everyone using the site, so one visitor (or
// one runaway script) must not be able to spend it all. This is a sliding
// window: each key keeps the timestamps of its recent requests, and a request
// is allowed while there are fewer than `limit` of them in the last `windowMs`.
//
// State is in memory, per server process. That is fine for a single Vercel
// instance and for local development; it is not shared between instances.

export type RateLimiter = {
  /** Returns whether the request may proceed and, if not, how long to wait. */
  check(key: string): { allowed: boolean; retryAfter: number };
};

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();

  return {
    check(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((ts) => t - ts < opts.windowMs);

      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        const oldest = recent[0];
        return { allowed: false, retryAfter: Math.ceil((oldest + opts.windowMs - t) / 1000) };
      }

      recent.push(t);
      hits.set(key, recent);
      return { allowed: true, retryAfter: 0 };
    },
  };
}
