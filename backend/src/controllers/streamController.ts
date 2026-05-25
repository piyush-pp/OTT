import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../utils/env.js";
import { HttpError } from "../utils/errors.js";
import { getObjectAsText, getObjectStream } from "../services/s3.js";
import { prisma } from "../db/prisma.js";

export function generateStreamToken(userId: string, videoId: string) {
  return jwt.sign({ videoId, type: "stream" }, env.JWT_SECRET, {
    subject: userId,
    expiresIn: "24h"
  });
}

export function generatePublicStreamToken(videoId: string) {
  return jwt.sign({ videoId, type: "stream_public" }, env.JWT_SECRET, {
    expiresIn: "24h"
  });
}

// Issued by share-link resolution; allows any visibility as long as video exists.
export function generateShareStreamToken(videoId: string) {
  return jwt.sign({ videoId, type: "stream_share" }, env.JWT_SECRET, {
    expiresIn: "24h"
  });
}

type StreamTokenPayload =
  | { type: "stream"; sub: string; videoId: string }
  | { type: "stream_public"; videoId: string }
  | { type: "stream_share"; videoId: string };

function verifyStreamToken(token: string, videoId: string): StreamTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      sub?: string;
      videoId?: string;
      type?: string;
    };
    if (payload.videoId !== videoId) return null;
    if (payload.type === "stream" && payload.sub) {
      return { type: "stream", sub: payload.sub, videoId };
    }
    if (payload.type === "stream_public") {
      return { type: "stream_public", videoId };
    }
    if (payload.type === "stream_share") {
      return { type: "stream_share", videoId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Rewrites non-comment HLS URI lines to absolute backend stream proxy URLs
 * so every request (m3u8 + ts) is authenticated via the stream token.
 *
 * currentDir: "" for master.m3u8, "360p" for 360p/index.m3u8, etc.
 */
function rewriteM3u8(
  content: string,
  baseUrl: string,
  token: string,
  currentDir: string
): string {
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const fullPath = currentDir ? `${currentDir}/${trimmed}` : trimmed;
      return `${baseUrl}/${fullPath}?t=${encodeURIComponent(token)}`;
    })
    .join("\n");
}

export async function streamHls(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    // Express wildcard captures everything after /stream/hls/ as params[0]
    const hlsPath: string = (req.params as Record<string, string>)[0] ?? "";
    const token = (req.query.t as string) ?? "";

    const payload = verifyStreamToken(token, id);
    if (!payload) return next(new HttpError(403, "Invalid or expired stream token"));

    // Public browse tokens: video must still be PUBLIC + non-deleted.
    if (payload.type === "stream_public") {
      const video = await prisma.video.findUnique({ where: { id } });
      if (!video || video.deletedAt || video.visibility !== "PUBLIC") {
        return next(new HttpError(403, "Video not available"));
      }
    }

    // Share-link tokens: video must exist and not be deleted; visibility is irrelevant
    // because the share link itself was the authorization gate.
    if (payload.type === "stream_share") {
      const video = await prisma.video.findUnique({ where: { id } });
      if (!video || video.deletedAt) {
        return next(new HttpError(403, "Video not available"));
      }
    }

    const s3Key = `videos/${id}/hls/${hlsPath}`;

    if (hlsPath.endsWith(".m3u8")) {
      let content: string;
      try {
        content = await getObjectAsText({ bucket: env.S3_BUCKET, key: s3Key });
      } catch {
        return next(new HttpError(404, "Playlist not found"));
      }

      // Derive the base stream URL from the incoming request
      const proto = req.get("x-forwarded-proto") ?? req.protocol;
      const host = req.get("x-forwarded-host") ?? req.get("host");
      const baseUrl = `${proto}://${host}/videos/${id}/stream/hls`;

      // currentDir is everything before the filename (e.g. "360p" for "360p/index.m3u8")
      const parts = hlsPath.split("/");
      const currentDir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

      const rewritten = rewriteM3u8(content, baseUrl, token, currentDir);

      res.set("Content-Type", "application/vnd.apple.mpegurl");
      res.set("Cache-Control", "no-cache");
      return res.send(rewritten);
    }

    if (hlsPath.endsWith(".ts")) {
      const rangeHeader = req.headers.range;

      let stream: Awaited<ReturnType<typeof getObjectStream>>;
      try {
        stream = await getObjectStream({
          bucket: env.S3_BUCKET,
          key: s3Key,
          range: rangeHeader
        });
      } catch {
        return next(new HttpError(404, "Segment not found"));
      }

      res.set("Accept-Ranges", "bytes");
      res.set("Content-Type", stream.contentType ?? "video/mp2t");
      res.set("Cache-Control", "public, max-age=31536000, immutable");

      if (rangeHeader && (stream.statusCode === 206 || stream.contentRange)) {
        res.status(206);
        if (stream.contentRange) res.set("Content-Range", stream.contentRange);
        if (stream.contentLength) res.set("Content-Length", String(stream.contentLength));
      } else {
        if (stream.contentLength) res.set("Content-Length", String(stream.contentLength));
      }

      stream.stream.pipe(res);
      return;
    }

    next(new HttpError(404, "Not found"));
  } catch (err) {
    next(err);
  }
}

export async function streamThumbnail(req: Request, res: Response, next: NextFunction) {
  try {
    // Accept auth via Bearer header OR ?auth= query param (needed for <img> tags)
    if (!req.user) {
      const queryToken = req.query.auth as string | undefined;
      if (!queryToken) return next(new HttpError(401, "Unauthorized"));
      try {
        const payload = jwt.verify(queryToken, env.JWT_SECRET) as { sub?: string };
        if (!payload.sub) return next(new HttpError(401, "Invalid token"));
        req.user = { id: payload.sub };
      } catch {
        return next(new HttpError(401, "Invalid token"));
      }
    }

    const { id } = req.params;
    const size = (req.query.size as string | undefined)?.toLowerCase();
    const sizeKeyMap: Record<string, string> = {
      sm: `videos/${id}/thumb_sm.jpg`,
      md: `videos/${id}/thumb_md.jpg`,
      lg: `videos/${id}/thumb_lg.jpg`
    };
    const primaryKey = size && sizeKeyMap[size] ? sizeKeyMap[size] : `videos/${id}/thumbnail.jpg`;
    // Fallback to the legacy single thumbnail if the size-specific one doesn't exist yet
    const fallbackKey = `videos/${id}/thumbnail.jpg`;

    let stream: Awaited<ReturnType<typeof getObjectStream>>;
    try {
      stream = await getObjectStream({ bucket: env.S3_BUCKET, key: primaryKey });
    } catch {
      if (primaryKey === fallbackKey) {
        return next(new HttpError(404, "Thumbnail not found"));
      }
      try {
        stream = await getObjectStream({ bucket: env.S3_BUCKET, key: fallbackKey });
      } catch {
        return next(new HttpError(404, "Thumbnail not found"));
      }
    }

    res.set("Content-Type", "image/jpeg");
    if (stream.contentLength) res.set("Content-Length", String(stream.contentLength));
    res.set("Cache-Control", "public, max-age=3600");
    stream.stream.pipe(res);
  } catch (err) {
    next(err);
  }
}
