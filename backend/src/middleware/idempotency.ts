import type { NextFunction, Request, Response } from "express";

type CacheEntry = {
  status: number;
  body: unknown;
  expiresAt: number;
};

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // sweep every hour

const cache = new Map<string, CacheEntry>();

const sweep = () => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
};

const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
sweepTimer.unref();

/**
 * Idempotency middleware. Looks up cache by `${userId}:${idempotencyKey}:${routePath}`.
 *
 * - If a cached entry exists and is non-expired, replays the cached status + body.
 * - Otherwise, intercepts `res.json` and caches the response under that key.
 *
 * Requires `req.user` (must run after requireAuth). If `Idempotency-Key` header is
 * absent, the middleware is a no-op.
 */
export function idempotency(req: Request, res: Response, next: NextFunction) {
  const idempotencyKey = req.header("idempotency-key");
  if (!idempotencyKey) return next();

  const userId = req.user?.id ?? "anonymous";
  const routePath = `${req.method} ${req.baseUrl}${req.path}`;
  const cacheKey = `${userId}:${idempotencyKey}:${routePath}`;

  const existing = cache.get(cacheKey);
  if (existing && existing.expiresAt > Date.now()) {
    res.set("Idempotent-Replay", "true");
    res.status(existing.status).json(existing.body);
    return;
  }

  // Intercept res.json to cache the eventual response
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    // Only cache 2xx responses; let errors retry normally
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(cacheKey, {
        status: res.statusCode,
        body,
        expiresAt: Date.now() + TTL_MS
      });
    }
    return originalJson(body);
  };

  next();
}

// Test/debug helpers (not exported via barrel)
export const _idempotencyInternals = {
  cache,
  clear: () => cache.clear()
};
