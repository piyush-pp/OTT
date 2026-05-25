import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../utils/errors.js";
import { videosService } from "../services/videosService.js";
import { paginate, paginationSchema } from "../utils/pagination.js";
import { auditService } from "../services/auditService.js";
import { CATEGORIES } from "../utils/categories.js";

const visibilitySchema = z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]);
const categorySchema = z.enum(CATEGORIES as unknown as [string, ...string[]]);

const uploadUrlSchema = z.object({
  filename: z.string().min(1).optional(),
  contentType: z.string().min(1).optional()
});

const completeSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  inputKey: z.string().min(1),
  visibility: visibilitySchema.optional(),
  category: categorySchema.nullable().optional(),
  description: z.string().nullable().optional()
});

const patchSchema = z
  .object({
    visibility: visibilitySchema.optional(),
    category: categorySchema.nullable().optional(),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided"
  });

export async function createUploadUrl(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const { filename, contentType } = uploadUrlSchema.parse(req.body ?? {});
    const result = await videosService.createUploadUrl({
      userId: req.user.id,
      filename,
      contentType
    });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function completeUpload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const parsed = completeSchema.parse(req.body);
    const video = await videosService.completeUpload({
      userId: req.user.id,
      videoId: parsed.videoId,
      title: parsed.title,
      inputKey: parsed.inputKey,
      visibility: parsed.visibility,
      category: (parsed.category ?? null) as never,
      description: parsed.description ?? null
    });
    auditService
      .log({
        userId: req.user.id,
        action: "video.upload",
        entityType: "Video",
        entityId: video.id,
        metadata: {
          title: video.title,
          inputKey: parsed.inputKey,
          visibility: video.visibility,
          category: video.category
        },
        req
      })
      .catch((e) => console.error("[audit] video.upload failed", e));
    res.json(video);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function listVideos(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const { page, pageSize } = paginationSchema.parse(req.query);
    const { items, total } = await videosService.list(req.user.id, { page, pageSize });
    res.json(paginate(items, total, page, pageSize));
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function getVideo(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const id = z.string().min(1).parse(req.params.id);
    const video = await videosService.get(req.user.id, id);
    res.json(video);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function patchVideo(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const id = z.string().min(1).parse(req.params.id);
    const updates = patchSchema.parse(req.body ?? {});
    const result = await videosService.patch(req.user.id, id, {
      visibility: updates.visibility,
      category: updates.category as never,
      title: updates.title,
      description: updates.description
    });
    if (result.visibilityChanged) {
      auditService
        .log({
          userId: req.user.id,
          action: "video.visibility_change",
          entityType: "Video",
          entityId: id,
          metadata: {
            from: result.previousVisibility,
            to: result.video.visibility
          },
          req
        })
        .catch((e) => console.error("[audit] video.visibility_change failed", e));
    }
    res.json(result.video);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function deleteVideo(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const id = z.string().min(1).parse(req.params.id);
    const result = await videosService.remove(req.user.id, id);
    auditService
      .log({
        userId: req.user.id,
        action: "video.delete",
        entityType: "Video",
        entityId: id,
        req
      })
      .catch((e) => console.error("[audit] video.delete failed", e));
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}
