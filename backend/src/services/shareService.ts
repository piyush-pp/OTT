import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { env } from "../utils/env.js";
import { HttpError } from "../utils/errors.js";

const DEFAULT_TTL_HOURS = 24;
const MAX_TTL_HOURS = 24 * 7; // 7 days

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const shareService = {
  /**
   * Create a new share link for a video. Caller must own the video.
   * Returns the raw token (only shown once) plus the share URL.
   */
  async create(params: { userId: string; videoId: string; ttlHours?: number }) {
    const requested = params.ttlHours ?? DEFAULT_TTL_HOURS;
    const ttl = Math.max(1, Math.min(requested, MAX_TTL_HOURS));

    const video = await prisma.video.findFirst({
      where: { id: params.videoId, userId: params.userId, deletedAt: null }
    });
    if (!video) throw new HttpError(404, "Video not found");

    const token = randomBytes(24).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000);

    const link = await prisma.shareLink.create({
      data: {
        tokenHash,
        videoId: params.videoId,
        userId: params.userId,
        expiresAt
      }
    });

    return {
      id: link.id,
      shareUrl: `${env.PUBLIC_BASE_URL}/s/${token}`,
      token,
      expiresAt,
      ttlHours: ttl
    };
  },

  /**
   * Resolve a raw token to its share link + associated video. Throws 404
   * for missing / revoked / expired / soft-deleted-video links.
   */
  async resolve(token: string) {
    if (!token) throw new HttpError(404, "Link not found or expired");
    const tokenHash = hashToken(token);
    const link = await prisma.shareLink.findUnique({
      where: { tokenHash },
      include: { video: true }
    });
    if (!link) throw new HttpError(404, "Link not found or expired");
    if (link.revokedAt) throw new HttpError(404, "Link not found or expired");
    if (link.expiresAt.getTime() < Date.now()) {
      throw new HttpError(404, "Link not found or expired");
    }
    if (link.video.deletedAt) throw new HttpError(404, "Link not found or expired");
    return { link, video: link.video };
  },

  /**
   * Revoke a share link. Owner-only.
   */
  async revoke(params: { userId: string; shareId: string }) {
    const link = await prisma.shareLink.findUnique({
      where: { id: params.shareId }
    });
    if (!link || link.userId !== params.userId) {
      throw new HttpError(404, "Share link not found");
    }
    if (link.revokedAt) {
      return { id: link.id, alreadyRevoked: true as const };
    }
    await prisma.shareLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() }
    });
    return { id: link.id, alreadyRevoked: false as const, videoId: link.videoId };
  },

  /**
   * List active (non-revoked, non-expired) share links for a video. Owner-only.
   */
  async listForVideo(params: { userId: string; videoId: string }) {
    const video = await prisma.video.findFirst({
      where: { id: params.videoId, userId: params.userId, deletedAt: null }
    });
    if (!video) throw new HttpError(404, "Video not found");

    const now = new Date();
    const links = await prisma.shareLink.findMany({
      where: {
        videoId: params.videoId,
        userId: params.userId,
        revokedAt: null,
        expiresAt: { gt: now }
      },
      orderBy: { createdAt: "desc" }
    });

    return links.map((l) => ({
      id: l.id,
      videoId: l.videoId,
      expiresAt: l.expiresAt,
      createdAt: l.createdAt
    }));
  }
};
