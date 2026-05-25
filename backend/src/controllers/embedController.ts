import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { env } from "../utils/env.js";
import { HttpError } from "../utils/errors.js";
import { generatePublicStreamToken } from "./streamController.js";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsString(s: string) {
  // Safe to embed inside a single-quoted JS string literal.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/</g, "\\u003C");
}

/**
 * GET /embed/:id — public, no auth, returns a minimal HTML page that
 * iframe-embeds the Video.js player loaded with a fresh public stream URL.
 * Refuses non-PUBLIC videos (404).
 */
export async function embedHtml(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.string().min(1).parse(req.params.id);

    const video = await prisma.video.findFirst({
      where: { id, visibility: "PUBLIC", status: "READY", deletedAt: null }
    });
    if (!video) return next(new HttpError(404, "Video not found"));

    const streamToken = generatePublicStreamToken(video.id);
    const playbackUrl = `${env.PUBLIC_BASE_URL}/videos/${video.id}/stream/hls/master.m3u8?t=${encodeURIComponent(
      streamToken
    )}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(video.title)}</title>
  <link href="https://vjs.zencdn.net/8.10.0/video-js.css" rel="stylesheet">
  <style>
    html, body { margin: 0; height: 100%; background: #000; }
    .video-js { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <video
    id="player"
    class="video-js vjs-default-skin vjs-big-play-centered"
    controls
    playsinline
    preload="auto"
    data-setup='{}'>
  </video>
  <script src="https://vjs.zencdn.net/8.10.0/video.min.js"></script>
  <script>
    (function () {
      var src = '${escapeJsString(playbackUrl)}';
      var player = videojs('player');
      player.src({ src: src, type: 'application/x-mpegURL' });
    })();
  </script>
</body>
</html>
`;

    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-cache");
    // Allow embedding anywhere — the whole point of this endpoint.
    res.set("X-Frame-Options", "ALLOWALL");
    res.set("Content-Security-Policy", "frame-ancestors *");
    res.send(html);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(404, "Not found"));
    next(err);
  }
}

/**
 * GET /api/v1/videos/:id/embed — auth required. Returns the iframe snippet
 * + src URL for any PUBLIC video. 404 for non-PUBLIC.
 */
export async function getEmbedSnippet(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const id = z.string().min(1).parse(req.params.id);

    const video = await prisma.video.findFirst({
      where: { id, visibility: "PUBLIC", status: "READY", deletedAt: null },
      select: { id: true }
    });
    if (!video) throw new HttpError(404, "Video not found");

    const src = `${env.PUBLIC_BASE_URL}/embed/${video.id}`;
    const html = `<iframe src="${src}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`;

    res.json({ html, src });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}
