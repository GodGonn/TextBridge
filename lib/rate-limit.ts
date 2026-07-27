type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const globalRateLimit = globalThis as typeof globalThis & {
  textBridgeRateLimits?: Map<string, RateLimitEntry>;
};

const entries = globalRateLimit.textBridgeRateLimits ?? new Map<string, RateLimitEntry>();
globalRateLimit.textBridgeRateLimits = entries;

export function getRequestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = entries.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;

  entry.count += 1;
  entries.set(key, entry);

  if (entries.size > 10_000) {
    for (const [storedKey, storedEntry] of entries) {
      if (storedEntry.resetAt <= now) entries.delete(storedKey);
    }
  }

  return {
    allowed: entry.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}
