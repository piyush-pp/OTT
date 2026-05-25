import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../utils/errors.js";
import { meService } from "../services/meService.js";
import { videosService } from "../services/videosService.js";
import { paginationSchema, paginate } from "../utils/pagination.js";

const heartbeatSchema = z.object({
  positionSec: z.number().int().min(0),
  completed: z.boolean().optional()
});

const historyQuerySchema = paginationSchema.extend({
  continueWatching: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .optional()
});

export async function postHeartbeat(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const videoId = z.string().min(1).parse(req.params.id);
    const body = heartbeatSchema.parse(req.body ?? {});
    const result = await videosService.heartbeat({
      userId: req.user.id,
      videoId,
      positionSec: body.positionSec,
      completed: body.completed
    });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function getHistory(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const { page, pageSize, continueWatching } = historyQuerySchema.parse(req.query);
    const flag = continueWatching === "true" || continueWatching === "1";
    const { items, total } = await meService.history({
      userId: req.user.id,
      continueWatching: flag,
      page,
      pageSize
    });
    res.json(paginate(items, total, page, pageSize));
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function getHistoryForVideo(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const videoId = z.string().min(1).parse(req.params.videoId);
    const result = await meService.historyForVideo({ userId: req.user.id, videoId });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function getMyStats(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const result = await meService.stats({ userId: req.user.id });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
