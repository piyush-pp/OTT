import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../utils/errors.js";
import { shareService } from "../services/shareService.js";
import { auditService } from "../services/auditService.js";
import { generateShareStreamToken } from "./streamController.js";

const createSchema = z
  .object({
    ttlHours: z.coerce.number().int().min(1).max(168).optional()
  })
  .strict();

export async function createShare(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const videoId = z.string().min(1).parse(req.params.id);
    const { ttlHours } = createSchema.parse(req.body ?? {});

    const result = await shareService.create({
      userId: req.user.id,
      videoId,
      ttlHours
    });

    auditService
      .log({
        userId: req.user.id,
        action: "share.create",
        entityType: "Video",
        entityId: videoId,
        metadata: { ttlHours: result.ttlHours, expiresAt: result.expiresAt.toISOString() },
        req
      })
      .catch((e) => console.error("[audit] share.create failed", e));

    res.json({
      id: result.id,
      shareUrl: result.shareUrl,
      token: result.token,
      expiresAt: result.expiresAt
    });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function resolveShare(req: Request, res: Response, next: NextFunction) {
  try {
    const token = z.string().min(1).parse(req.params.token);
    const { link, video } = await shareService.resolve(token);

    const streamToken = generateShareStreamToken(video.id);
    const playbackUrl = `/videos/${video.id}/stream/hls/master.m3u8?t=${encodeURIComponent(
      streamToken
    )}`;

    res.json({
      video: {
        id: video.id,
        title: video.title,
        description: video.description,
        category: video.category,
        status: video.status,
        visibility: video.visibility,
        duration: video.duration,
        sizeBytes: video.sizeBytes,
        viewCount: video.viewCount,
        createdAt: video.createdAt
      },
      playbackUrl,
      expiresAt: link.expiresAt
    });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(404, "Link not found or expired"));
    next(err);
  }
}

export async function revokeShare(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const shareId = z.string().min(1).parse(req.params.id);
    const result = await shareService.revoke({ userId: req.user.id, shareId });

    if (!result.alreadyRevoked) {
      auditService
        .log({
          userId: req.user.id,
          action: "share.revoke",
          entityType: "ShareLink",
          entityId: result.id,
          metadata: { videoId: result.videoId },
          req
        })
        .catch((e) => console.error("[audit] share.revoke failed", e));
    }

    res.json({ success: true, id: result.id });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function listShares(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const videoId = z.string().min(1).parse(req.params.id);
    const shares = await shareService.listForVideo({ userId: req.user.id, videoId });
    res.json({ data: shares });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}
