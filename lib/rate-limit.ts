import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const globalRateLimit = globalThis as typeof globalThis & {
  textBridgeRateLimits?: Map<string, RateLimitEntry>;
};

const entries = globalRateLimit.textBridgeRateLimits ?? new Map<string, RateLimitEntry>();
globalRateLimit.textBridgeRateLimits = entries;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const sharedRateLimitClient = supabaseUrl && supabaseServerKey
  ? createClient(supabaseUrl, supabaseServerKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export function getRequestAddress(request: Request) {
  const forwardedAddresses = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((address) => address.trim())
    .reverse();
  const candidates = [
    request.headers.get("cf-connecting-ip")?.trim(),
    request.headers.get("x-real-ip")?.trim(),
    ...forwardedAddresses,
  ];

  return candidates.find((address) => address && isIP(address)) ?? "unknown";
}

function consumeLocalRateLimit(key: string, limit: number, windowMs: number) {
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

export async function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const hashedKey = createHash("sha256").update(key).digest("hex");

  if (sharedRateLimitClient) {
    try {
      const { data, error } = await sharedRateLimitClient.rpc("consume_rate_limit", {
        p_bucket_key: hashedKey,
        p_limit: limit,
        p_window_ms: windowMs,
      });

      if (!error && Array.isArray(data) && data[0]) {
        return {
          allowed: Boolean(data[0].allowed),
          retryAfterSeconds: Math.max(1, Number(data[0].retry_after_seconds) || 1),
        };
      }

      console.error("Shared rate limiter unavailable; using process-local fallback.", error?.message ?? "Invalid RPC response");
    } catch (caught) {
      console.error("Shared rate limiter unavailable; using process-local fallback.", caught instanceof Error ? caught.message : "RPC request failed");
    }
  }

  return consumeLocalRateLimit(hashedKey, limit, windowMs);
}
