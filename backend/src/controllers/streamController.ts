import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../utils/env.js";
import { HttpError } from "../utils/errors.js";
import { getObjectAsText, getObjectStream } from "../services/s3.js";
import { prisma } from "../db/prisma.js";
import {
  buildAndStoreSession,
  getSession,
  getAdVariantSegments,
  POST_SENTINEL,
  type AdBreakEntry
} from "../services/adScheduleService.js";
import { recordAdEvent, inferAdEvent } from "../services/adTrackingService.js";

// ─── Stream tokens ────────────────────────────────────────────────────────────

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

// ─── Playlist rewriting ───────────────────────────────────────────────────────

/**
 * Rewrites non-comment HLS URI lines to absolute backend stream proxy URLs.
 * Used for the master playlist and for variant playlists when no ad stitching
 * is needed.
 *
 * currentDir: "" for master.m3u8, "360p" for 360p/index.m3u8, etc.
 */
function rewriteM3u8(
  content: string,
  baseUrl: string,
  token: string,
  currentDir: string,
  sessionId?: string
): string {
  const sessionSuffix = sessionId ? `&session=${encodeURIComponent(sessionId)}` : "";
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const fullPath = currentDir ? `${currentDir}/${trimmed}` : trimmed;
      return `${baseUrl}/${fullPath}?t=${encodeURIComponent(token)}${sessionSuffix}`;
    })
    .join("\n");
}

/**
 * Builds the HLS lines for a single ad break (CUE-OUT, DISCONTINUITY, ad
 * segments, CUE-IN, DISCONTINUITY).
 */
function buildAdBlock(params: {
  adBreak: AdBreakEntry;
  segments: { duration: number; filename: string }[];
  baseUrl: string;
  token: string;
  rendition: string;
  sessionId: string;
}): string[] {
  const { adBreak, segments, baseUrl, token, rendition, sessionId } = params;
  if (segments.length === 0) return [];

  const lines: string[] = [];
  lines.push(`#EXT-X-CUE-OUT:${adBreak.durationSec}`);
  lines.push("#EXT-X-DISCONTINUITY");

  // Optional skip-after tag so the player can show a "Skip Ad" button
  if (adBreak.skipOffsetSec !== undefined) {
    lines.push(
      `#EXT-X-DATERANGE:ID="ad-${adBreak.creativeId.slice(0, 8)}",` +
        `CLASS="interstitial",` +
        `START-DATE="${new Date().toISOString()}",` +
        `DURATION=${adBreak.durationSec},` +
        `X-SKIP-OFFSET=${adBreak.skipOffsetSec}`
    );
  }

  for (const seg of segments) {
    lines.push(`#EXTINF:${seg.duration.toFixed(3)},`);
    // Ad segment URL: routed through the same stream proxy, ads/ prefix signals S3 key
    lines.push(
      `${baseUrl}/ads/${adBreak.creativeId}/hls/${rendition}/${seg.filename}` +
        `?t=${encodeURIComponent(token)}` +
        `&session=${encodeURIComponent(sessionId)}` +
        `&placement=${encodeURIComponent(adBreak.placementId)}`
    );
  }

  lines.push("#EXT-X-CUE-IN");
  lines.push("#EXT-X-DISCONTINUITY");
  return lines;
}

/**
 * Stitches ad breaks into a variant playlist (e.g. 360p/index.m3u8).
 *
 * - PRE-ROLL (offsetSec === 0): inserted before the first content segment
 * - MID-ROLL (0 < offsetSec < POST_SENTINEL): inserted after the segment
 *   whose cumulative time reaches the offset
 * - POST-ROLL (offsetSec === POST_SENTINEL): inserted just before #EXT-X-ENDLIST
 *
 * Ad variant playlists are fetched in parallel before scanning the playlist.
 */
async function stitchVariantPlaylist(params: {
  content: string;
  baseUrl: string;
  token: string;
  rendition: string;
  adBreaks: AdBreakEntry[];
  sessionId: string;
}): Promise<string> {
  const { content, baseUrl, token, rendition, adBreaks, sessionId } = params;

  // Pre-fetch all ad variant playlists in parallel to minimise latency
  const segMap = new Map<string, { duration: number; filename: string }[]>();
  await Promise.all(
    adBreaks.map(async (b) => {
      const segs = await getAdVariantSegments(b.hlsBasePath, rendition);
      segMap.set(b.creativeId, segs);
    })
  );

  const lines = content.split("\n");
  const out: string[] = [];
  let cumSec = 0;
  let firstSegSeen = false;
  let remaining = [...adBreaks];

  const insertBreak = (b: AdBreakEntry) => {
    const segs = segMap.get(b.creativeId) ?? [];
    const block = buildAdBlock({ adBreak: b, segments: segs, baseUrl, token, rendition, sessionId });
    out.push(...block);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) {
      out.push(line);
      continue;
    }

    // POST-ROLL: insert just before the end-list tag
    if (trimmed === "#EXT-X-ENDLIST") {
      const post = remaining.filter((b) => b.offsetSec >= POST_SENTINEL);
      remaining = remaining.filter((b) => b.offsetSec < POST_SENTINEL);
      for (const b of post) insertBreak(b);
      out.push(line);
      continue;
    }

    // Content segment pairs: #EXTINF followed by a URI line
    if (trimmed.startsWith("#EXTINF:")) {
      const segDuration = parseFloat(trimmed.slice(8).replace(/,.*$/, ""));
      const segUri = lines[i + 1]?.trim() ?? "";

      // PRE-ROLL: insert before the first segment only
      if (!firstSegSeen) {
        firstSegSeen = true;
        const pre = remaining.filter((b) => b.offsetSec === 0);
        remaining = remaining.filter((b) => b.offsetSec !== 0);
        for (const b of pre) insertBreak(b);
      }

      // Emit the content segment (rewrite URI to authenticated proxy URL)
      out.push(line);
      if (!segUri.startsWith("#")) {
        const fullPath = rendition ? `${rendition}/${segUri}` : segUri;
        out.push(
          `${baseUrl}/${fullPath}` +
            `?t=${encodeURIComponent(token)}` +
            `&session=${encodeURIComponent(sessionId)}`
        );
        i++; // consume the URI line we just emitted
      }

      cumSec += segDuration;

      // MID-ROLL: fire breaks whose offset has been reached
      const due = remaining.filter(
        (b) => b.offsetSec > 0 && b.offsetSec < POST_SENTINEL && cumSec >= b.offsetSec
      );
      remaining = remaining.filter((b) => !due.includes(b));
      for (const b of due) insertBreak(b);

      continue;
    }

    // All other lines (header tags, etc.) pass through unchanged
    out.push(line);
  }

  return out.join("\n");
}

// ─── Main stream handler ──────────────────────────────────────────────────────

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

    // ─── .ts segments ──────────────────────────────────────────────────────────
    if (hlsPath.endsWith(".ts")) {
      const isAdSegment = hlsPath.startsWith("ads/");

      // Ad segments: hlsPath IS the S3 key (e.g. "ads/{id}/hls/360p/seg_00000.ts")
      // Content segments: prepend the content prefix
      const s3Key = isAdSegment ? hlsPath : `videos/${id}/hls/${hlsPath}`;

      // ── Ad impression tracking (fire-and-forget, never delays response) ──
      if (isAdSegment) {
        const sessionId = (req.query.session as string) ?? "";
        const placementId = (req.query.placement as string) ?? "";
        // hlsPath = "ads/{creativeId}/hls/{rendition}/{filename}"
        const pathParts = hlsPath.split("/");
        const creativeId = pathParts[1] ?? "";
        const segFilename = pathParts[pathParts.length - 1] ?? "";

        if (sessionId && placementId && creativeId) {
          void getSession(sessionId).then((session) => {
            const adBreak = session?.adBreaks.find((b) => b.placementId === placementId);
            if (!adBreak) return;
            const event = inferAdEvent(segFilename, adBreak.durationSec);
            if (!event) return;
            const userId = payload.type === "stream" ? payload.sub : undefined;
            recordAdEvent({ creativeId, placementId, videoId: id, sessionId, userId, event });
          }).catch(() => { /* tracking errors are non-fatal */ });
        }
      }

      const rangeHeader = req.headers.range;
      let stream: Awaited<ReturnType<typeof getObjectStream>>;
      try {
        stream = await getObjectStream({ bucket: env.S3_BUCKET, key: s3Key, range: rangeHeader });
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

    // ─── .m3u8 playlists ───────────────────────────────────────────────────────
    if (hlsPath.endsWith(".m3u8")) {
      const s3Key = `videos/${id}/hls/${hlsPath}`;

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

      const parts = hlsPath.split("/");
      const filename = parts[parts.length - 1] ?? "";
      const isMaster = filename === "master.m3u8";
      const currentDir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

      let sessionId = (req.query.session as string) ?? "";

      // ── Session init on master.m3u8 ──────────────────────────────────────────
      if (isMaster && !sessionId) {
        const userId = payload.type === "stream" ? payload.sub : undefined;
        // Only authenticated users get personalised ad sessions
        if (userId) {
          const video = await prisma.video.findUnique({
            where: { id },
            select: { category: true }
          });
          const session = await buildAndStoreSession({
            videoId: id,
            userId,
            category: video?.category ?? null
          });
          if (session) sessionId = session.sessionId;
        }
      }

      let rewritten: string;

      if (!isMaster && sessionId) {
        // Variant playlist with an active ad session — stitch if breaks exist
        const session = await getSession(sessionId).catch(() => null);
        if (session && session.adBreaks.length > 0) {
          rewritten = await stitchVariantPlaylist({
            content,
            baseUrl,
            token,
            rendition: currentDir, // e.g. "360p"
            adBreaks: session.adBreaks,
            sessionId
          });
        } else {
          rewritten = rewriteM3u8(content, baseUrl, token, currentDir, sessionId);
        }
      } else {
        rewritten = rewriteM3u8(content, baseUrl, token, currentDir, sessionId || undefined);
      }

      res.set("Content-Type", "application/vnd.apple.mpegurl");
      res.set("Cache-Control", "no-cache");
      return res.send(rewritten);
    }

    next(new HttpError(404, "Not found"));
  } catch (err) {
    next(err);
  }
}

// ─── Thumbnail handler ────────────────────────────────────────────────────────

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
