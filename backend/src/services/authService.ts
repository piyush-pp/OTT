import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { env } from "../utils/env.js";
import { HttpError } from "../utils/errors.js";
import { sendEmail } from "./emailService.js";

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function generateOpaqueToken() {
  return randomBytes(32).toString("hex");
}

function issueAccessToken(userId: string) {
  return jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: "15m" });
}

async function issueRefreshToken(userId: string) {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await prisma.refreshToken.create({
    data: { tokenHash: hash(token), userId, expiresAt }
  });
  return token;
}

export const authService = {
  async signup(email: string, password: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, "Email already in use");

    const passwordHash = await bcrypt.hash(password, 10);

    const verifyToken = generateOpaqueToken();
    const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        emailVerifyTokenHash: hash(verifyToken),
        emailVerifyTokenExpires: verifyTokenExpires
      }
    });

    await sendEmail({
      to: email,
      subject: "Verify your email",
      text: `Welcome! Verify your email by clicking:\n\n${env.CDN_BASE_URL}/verify-email?token=${verifyToken}\n\nThis link expires in 24 hours.`
    });

    const [accessToken, refreshToken] = await Promise.all([
      issueAccessToken(user.id),
      issueRefreshToken(user.id)
    ]);
    return { accessToken, refreshToken };
  },

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new HttpError(401, "Invalid credentials");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid credentials");

    const [accessToken, refreshToken] = await Promise.all([
      issueAccessToken(user.id),
      issueRefreshToken(user.id)
    ]);
    return { accessToken, refreshToken };
  },

  async refresh(refreshToken: string) {
    const tokenHash = hash(refreshToken);
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new HttpError(401, "Invalid or expired refresh token");
    }

    // Rotate: revoke old token, issue new pair
    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() }
    });

    const [accessToken, newRefreshToken] = await Promise.all([
      issueAccessToken(record.userId),
      issueRefreshToken(record.userId)
    ]);
    return { accessToken, refreshToken: newRefreshToken };
  },

  async logout(refreshToken: string) {
    const tokenHash = hash(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  },

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    if (!user) return;

    // Invalidate any existing reset tokens for this user
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { tokenHash: hash(token), userId: user.id, expiresAt }
    });

    await sendEmail({
      to: email,
      subject: "Reset your password",
      text: `Reset your password by clicking:\n\n${env.CDN_BASE_URL}/reset-password?token=${token}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`
    });
  },

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hash(token);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new HttpError(400, "Invalid or expired reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash }
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() }
      }),
      // Revoke all active refresh tokens (force re-login on all devices)
      prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);
  },

  async verifyEmail(token: string) {
    const tokenHash = hash(token);
    const user = await prisma.user.findUnique({ where: { emailVerifyTokenHash: tokenHash } });

    if (!user || !user.emailVerifyTokenExpires || user.emailVerifyTokenExpires < new Date()) {
      throw new HttpError(400, "Invalid or expired verification token");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyTokenHash: null,
        emailVerifyTokenExpires: null
      }
    });
  },

  async resendVerification(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, "User not found");
    if (user.emailVerified) throw new HttpError(400, "Email already verified");

    const verifyToken = generateOpaqueToken();
    const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifyTokenHash: hash(verifyToken),
        emailVerifyTokenExpires: verifyTokenExpires
      }
    });

    await sendEmail({
      to: user.email,
      subject: "Verify your email",
      text: `Verify your email by clicking:\n\n${env.CDN_BASE_URL}/verify-email?token=${verifyToken}\n\nThis link expires in 24 hours.`
    });
  }
};
