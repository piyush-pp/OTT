import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../utils/errors.js";
import { videosService } from "../services/videosService.js";
import { paginate, paginationSchema } from "../utils/pagination.js";
import { prisma } from "../db/prisma.js";
import { env } from "../utils/env.js";
import { getObjectStream } from "../services/s3.js";

const browseQuerySchema = paginationSchema.extend({
  q: z.string().min(1).optional(),
  category: z.string().min(1).optional()
});

export async function listPublicVideos(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = browseQuerySchema.parse(req.query);
    const { items, total } = await videosService.listPublic({
      q: parsed.q,
      category: parsed.category,
      page: parsed.page,
      pageSize: parsed.pageSize
    });
    res.json(paginate(items, total, parsed.page, parsed.pageSize));
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function getFeaturedVideo(_req: Request, res: Response, next: NextFunction) {
  try {
    const video = await videosService.getFeatured();
    res.json({ data: video });
  } catch (err) {
    next(err);
  }
}

export async function getPublicVideo(req: Request, res: Response, next: NextFunction) {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const video = await videosService.getPublic(id);
    res.json(video);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function streamPublicThumbnail(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = z.string().min(1).parse(req.params.id);

    // Visibility gate — only PUBLIC + non-deleted videos expose their thumbnail here.
    const video = await prisma.video.findFirst({
      where: { id, visibility: "PUBLIC", deletedAt: null },
      select: { id: true, thumbnailUrl: true }
    });
    if (!video) return next(new HttpError(404, "Not found"));

    const size = (req.query.size as string | undefined)?.toLowerCase();
    const sizeKeyMap: Record<string, string> = {
      sm: `videos/${id}/thumb_sm.jpg`,
      md: `videos/${id}/thumb_md.jpg`,
      lg: `videos/${id}/thumb_lg.jpg`
    };
    const primaryKey = size && sizeKeyMap[size] ? sizeKeyMap[size] : `videos/${id}/thumbnail.jpg`;
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
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}
