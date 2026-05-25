import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../utils/env.js";
import { HttpError } from "../utils/errors.js";
import { prisma } from "../db/prisma.js";

export type AuthUser = { id: string };

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError(401, "Missing Authorization header"));
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
    if (!payload.sub) return next(new HttpError(401, "Invalid token"));
    req.user = { id: payload.sub };
    next();
  } catch {
    next(new HttpError(401, "Invalid token"));
  }
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Unauthorized"));
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { role: true }
    });
    if (!user || user.role !== "ADMIN") {
      return next(new HttpError(403, "Admin only"));
    }
    next();
  } catch (err) {
    next(err);
  }
}
