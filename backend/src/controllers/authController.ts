import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { HttpError } from "../utils/errors.js";
import { authService } from "../services/authService.js";
import { auditService } from "../services/auditService.js";
import { env } from "../utils/env.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const forgotSchema = z.object({
  email: z.string().email()
});

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8)
});

const verifySchema = z.object({
  token: z.string().min(1)
});

function userIdFromAccessToken(accessToken: string): string | undefined {
  try {
    const payload = jwt.verify(accessToken, env.JWT_SECRET) as { sub?: string };
    return payload.sub;
  } catch {
    return undefined;
  }
}

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = credentialsSchema.parse(req.body);
    const tokens = await authService.signup(email, password);
    const userId = userIdFromAccessToken(tokens.accessToken);
    auditService
      .log({ userId, action: "auth.signup", entityType: "User", entityId: userId, metadata: { email }, req })
      .catch((e) => console.error("[audit] auth.signup failed", e));
    res.status(201).json(tokens);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.errors[0].message));
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = credentialsSchema.parse(req.body);
    const tokens = await authService.login(email, password);
    const userId = userIdFromAccessToken(tokens.accessToken);
    auditService
      .log({ userId, action: "auth.login", entityType: "User", entityId: userId, metadata: { email }, req })
      .catch((e) => console.error("[audit] auth.login failed", e));
    res.json(tokens);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.errors[0].message));
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await authService.refresh(refreshToken);
    res.json(tokens);
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.errors[0].message));
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    auditService
      .log({ userId: req.user?.id, action: "auth.logout", entityType: "User", entityId: req.user?.id, req })
      .catch((e) => console.error("[audit] auth.logout failed", e));
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.errors[0].message));
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = forgotSchema.parse(req.body);
    await authService.forgotPassword(email);
    // Always 200 to prevent email enumeration
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.errors[0].message));
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = resetSchema.parse(req.body);
    await authService.resetPassword(token, password);
    auditService
      .log({ action: "auth.password_reset", entityType: "User", req })
      .catch((e) => console.error("[audit] auth.password_reset failed", e));
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.errors[0].message));
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = verifySchema.parse(req.query);
    await authService.verifyEmail(token);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(400, err.errors[0].message));
    next(err);
  }
}

export async function resendVerification(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new HttpError(401, "Unauthorized");
    await authService.resendVerification(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
