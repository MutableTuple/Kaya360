// Sliding-window in-memory rate limiter (per server instance). External API
// spend is additionally capped by the monthly budget in integration_usage.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limitPerMinute: number, now = Date.now()) {
  const windowStart = now - 60_000;
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart);
  if (hits.length >= limitPerMinute) {
    buckets.set(key, hits);
    return { ok: false as const, retryAfter: Math.ceil((hits[0] + 60_000 - now) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (!v.some((t) => t > windowStart)) buckets.delete(k);
  return { ok: true as const, remaining: limitPerMinute - hits.length };
}
