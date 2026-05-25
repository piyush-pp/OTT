import type { Request, Response, NextFunction } from "express";
import IORedis from "ioredis";
import jwt from "jsonwebtoken";
import { env } from "../utils/env.js";
import { HttpError } from "../utils/errors.js";
import { prisma } from "../db/prisma.js";

/**
 * Resolves the request user from either an Authorization header (already set
 * by requireAuth) or, as a fallback, a `?auth=<accessToken>` query param.
 * EventSource on the browser cannot send custom headers, so we mirror the
 * pattern used by the thumbnail endpoint.
 */
function resolveUser(req: Request): { id: string } | null {
  if (req.user) return req.user;
  const queryToken = req.query.auth as string | undefined;
  if (!queryToken) return null;
  try {
    const payload = jwt.verify(queryToken, env.JWT_SECRET) as { sub?: string };
    if (!payload.sub) return null;
    return { id: payload.sub };
  } catch {
    return null;
  }
}

export async function videoEvents(req: Request, res: Response, next: NextFunction) {
  // Subscriber connection — must NOT be shared across requests because Redis
  // subscriptions are connection-scoped.
  let localSub: IORedis | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  try {
    const user = resolveUser(req);
    if (!user) return next(new HttpError(401, "Unauthorized"));

    const { id } = req.params;

    // Access control: user must own the video OR the video must be PUBLIC.
    const video = await prisma.video.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [{ userId: user.id }, { visibility: "PUBLIC" }]
      },
      select: { id: true, status: true, progress: true, error: true }
    });
    if (!video) return next(new HttpError(404, "Not found"));

    // SSE headers — must be set before any body is written.
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.status(200);
    res.flushHeaders();

    // Immediate snapshot of the current DB state.
    res.write(
      `event: snapshot\ndata: ${JSON.stringify({
        status: video.status,
        progress: video.progress,
        error: video.error
      })}\n\n`
    );

    const channel = `video:${id}:progress`;
    localSub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

    localSub.on("message", (_ch, msg) => {
      // Pass through the payload published by the worker verbatim.
      res.write(`event: update\ndata: ${msg}\n\n`);
    });

    localSub.on("error", (err) => {
      console.error("[sse] redis subscriber error", err);
    });

    await localSub.subscribe(channel);

    // Heartbeat comment line every 15s so proxies/clients don't time out.
    heartbeatTimer = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        // ignore — request will be cleaned up by the close handler.
      }
    }, 15_000);

    const cleanup = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (localSub) {
        const s = localSub;
        localSub = null;
        s.unsubscribe(channel)
          .catch(() => {})
          .finally(() => {
            try {
              s.disconnect();
            } catch {
              // ignore
            }
          });
      }
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
  } catch (err) {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (localSub) {
      try {
        localSub.disconnect();
      } catch {
        // ignore
      }
    }
    next(err);
  }
}
