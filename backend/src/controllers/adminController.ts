import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../utils/errors.js";
import { prisma } from "../db/prisma.js";
import { paginate, paginationSchema } from "../utils/pagination.js";
import { auditService } from "../services/auditService.js";
import { CATEGORIES } from "../utils/categories.js";
import { meService } from "../services/meService.js";
import type { Prisma } from "@prisma/client";

const visibilitySchema = z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]);
const categorySchema = z.enum(CATEGORIES as unknown as [string, ...string[]]);

const adminPatchSchema = z
  .object({
    featured: z.boolean().optional(),
    visibility: visibilitySchema.optional(),
    category: categorySchema.nullable().optional(),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided"
  });

export async function patchVideoAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    const id = z.string().min(1).parse(req.params.id);
    const updates = adminPatchSchema.parse(req.body ?? {});

    const existing = await prisma.video.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new HttpError(404, "Video not found");

    const data: Prisma.VideoUpdateInput = {};
    if (updates.featured !== undefined) data.featured = updates.featured;
    if (updates.visibility !== undefined) data.visibility = updates.visibility;
    if (updates.category !== undefined) data.category = updates.category;
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.description !== undefined) data.description = updates.description;

    const updated = await prisma.video.update({ where: { id }, data });

    if (updates.visibility !== undefined && updates.visibility !== existing.visibility) {
      auditService
        .log({
          userId: req.user.id,
          action: "video.visibility_change",
          entityType: "Video",
          entityId: id,
          metadata: {
            from: existing.visibility,
            to: updated.visibility,
            by: "admin"
          },
          req
        })
        .catch((e) => console.error("[audit] video.visibility_change failed", e));
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, pageSize } = paginationSchema.parse(req.query);
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          role: true,
          displayName: true,
          createdAt: true,
          emailVerified: true
        }
      }),
      prisma.user.count()
    ]);
    res.json(paginate(items, total, page, pageSize));
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.message));
    next(err);
  }
}

export async function getPlatformStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const [totalUsers, totalVideos, storageAgg, viewsAgg, extras] = await Promise.all([
      prisma.user.count(),
      prisma.video.count({ where: { deletedAt: null } }),
      prisma.video.aggregate({
        where: { deletedAt: null },
        _sum: { sizeBytes: true }
      }),
      prisma.video.aggregate({
        where: { deletedAt: null },
        _sum: { viewCount: true }
      }),
      meService.adminExtras()
    ]);
    res.json({
      totalUsers,
      totalVideos,
      totalStorage: storageAgg._sum.sizeBytes ?? BigInt(0),
      totalViews: viewsAgg._sum.viewCount ?? 0,
      viewsLast7Days: extras.viewsLast7Days,
      uploadsLast7Days: extras.uploadsLast7Days,
      topVideos: extras.topVideos
    });
  } catch (err) {
    next(err);
  }
}
