import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../utils/errors.js";
import { videosService } from "../services/videosService.js";

const uploadUrlSchema = z.object({
  filename: z.string().min(1).optional(),
  contentType: z.string().min(1).optional()
});

const completeSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  inputKey: z.string().min(1)
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
    const { videoId, title, inputKey } = completeSchema.parse(req.body);
    const video = await videosService.completeUpload({
      userId: req.user.id,
      videoId,
      title,
      inputKey
    });
    res.json(video);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function listVideos(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const videos = await videosService.list(req.user.id);
    res.json({ videos });
  } catch (err) {
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

export async function deleteVideo(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const id = z.string().min(1).parse(req.params.id);
    const result = await videosService.remove(req.user.id, id);
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}
