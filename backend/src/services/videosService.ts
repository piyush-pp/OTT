import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { env } from "../utils/env.js";
import { HttpError } from "../utils/errors.js";
import { deleteByPrefix, headObject, presignPutObject } from "./s3.js";
import { videoTranscodeQueue } from "../queue/videoQueue.js";
import {
  generateStreamToken,
  generatePublicStreamToken
} from "../controllers/streamController.js";
import { isCategory, type Category } from "../utils/categories.js";

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/x-matroska",
  "video/mpeg",
  "video/ogg",
  "video/3gpp",
  "video/x-flv"
]);

type Visibility = "PRIVATE" | "UNLISTED" | "PUBLIC";

function normalizeExtension(filename?: string) {
  if (!filename) return ".mp4";
  const ext = path.extname(filename);
  return ext || ".mp4";
}

function ownerThumbnailPath(videoId: string) {
  return `/videos/${videoId}/thumbnail`;
}

function ownerThumbnailSet(videoId: string) {
  return {
    sm: `/videos/${videoId}/thumbnail?size=sm`,
    md: `/videos/${videoId}/thumbnail?size=md`,
    lg: `/videos/${videoId}/thumbnail?size=lg`
  };
}

function publicThumbnailPath(videoId: string) {
  return `/api/v1/browse/${videoId}/thumbnail`;
}

function publicThumbnailSet(videoId: string) {
  return {
    sm: `/api/v1/browse/${videoId}/thumbnail?size=sm`,
    md: `/api/v1/browse/${videoId}/thumbnail?size=md`,
    lg: `/api/v1/browse/${videoId}/thumbnail?size=lg`
  };
}

function incrementViewCount(id: string) {
  prisma.video
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch((e) => console.error("[viewCount] increment failed", e));
}

export const videosService = {
  async createUploadUrl(params: {
    userId: string;
    filename?: string;
    contentType?: string;
  }) {
    if (params.contentType) {
      const mime = params.contentType.split(";")[0].trim().toLowerCase();
      if (!mime.startsWith("video/") || !ALLOWED_VIDEO_TYPES.has(mime)) {
        throw new HttpError(400, `Unsupported content type: ${mime}. Only video files are allowed.`);
      }
    }

    const videoId = randomUUID();
    const ext = normalizeExtension(params.filename);
    const inputKey = `uploads/${videoId}/input${ext}`;
    const uploadUrl = await presignPutObject({
      bucket: env.S3_BUCKET,
      key: inputKey,
      contentType: params.contentType
    });

    return { videoId, inputKey, uploadUrl };
  },

  async completeUpload(params: {
    userId: string;
    videoId: string;
    title: string;
    inputKey: string;
    visibility?: Visibility;
    category?: Category | null;
    description?: string | null;
  }) {
    const existing = await prisma.video.findUnique({ where: { id: params.videoId } });
    if (existing) throw new HttpError(409, "Video already exists");

    // Verify the uploaded file and enforce size limit
    let sizeBytes: bigint | null = null;
    try {
      const head = await headObject({ bucket: env.S3_BUCKET, key: params.inputKey });
      if ((head.ContentLength ?? 0) > env.MAX_UPLOAD_BYTES) {
        await deleteByPrefix({ bucket: env.S3_BUCKET, prefix: `uploads/${params.videoId}/` });
        throw new HttpError(
          400,
          `File too large. Maximum allowed size is ${Math.round(env.MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`
        );
      }
      if (typeof head.ContentLength === "number") {
        sizeBytes = BigInt(head.ContentLength);
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, "Uploaded file not found. Please upload the file before calling complete.");
    }

    const inputUrl = `s3://${env.S3_BUCKET}/${params.inputKey}`;
    const video = await prisma.video.create({
      data: {
        id: params.videoId,
        userId: params.userId,
        title: params.title,
        description: params.description ?? null,
        status: "UPLOADED",
        visibility: params.visibility ?? "PRIVATE",
        category: params.category ?? null,
        sizeBytes,
        inputUrl,
        inputKey: params.inputKey
      }
    });

    await videoTranscodeQueue.add("transcode", {
      videoId: video.id,
      bucket: env.S3_BUCKET,
      inputKey: params.inputKey
    });

    return video;
  },

  async list(userId: string, params: { page: number; pageSize: number }) {
    const where = { userId, deletedAt: null };
    const [items, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize
      }),
      prisma.video.count({ where })
    ]);

    const mapped = items.map((v) => ({
      ...v,
      thumbnailUrl: v.thumbnailUrl ? ownerThumbnailPath(v.id) : null,
      thumbnails: v.thumbnailUrl ? ownerThumbnailSet(v.id) : null,
      playbackUrl: null // Not included in list; fetch individual video for playback
    }));

    return { items: mapped, total };
  },

  async get(userId: string, id: string) {
    const video = await prisma.video.findFirst({ where: { id, userId, deletedAt: null } });
    if (!video) throw new HttpError(404, "Video not found");

    let playbackUrl: string | null = null;
    if (video.status === "READY") {
      const streamToken = generateStreamToken(userId, id);
      playbackUrl = `/videos/${id}/stream/hls/master.m3u8?t=${encodeURIComponent(streamToken)}`;
      incrementViewCount(id);
    }

    return {
      ...video,
      playbackUrl,
      thumbnailUrl: video.thumbnailUrl ? ownerThumbnailPath(id) : null,
      thumbnails: video.thumbnailUrl ? ownerThumbnailSet(id) : null
    };
  },

  async remove(userId: string, id: string) {
    const video = await prisma.video.findFirst({ where: { id, userId, deletedAt: null } });
    if (!video) throw new HttpError(404, "Video not found");

    // S3 assets are removed immediately; the DB row is soft-deleted for the audit trail.
    await Promise.all([
      deleteByPrefix({ bucket: env.S3_BUCKET, prefix: `videos/${id}/` }),
      deleteByPrefix({ bucket: env.S3_BUCKET, prefix: `uploads/${id}/` })
    ]);

    await prisma.video.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    return { success: true };
  },

  async patch(
    userId: string,
    id: string,
    updates: {
      visibility?: Visibility;
      category?: Category | null;
      title?: string;
      description?: string | null;
    }
  ) {
    const video = await prisma.video.findFirst({ where: { id, userId, deletedAt: null } });
    if (!video) throw new HttpError(404, "Video not found");

    const data: Prisma.VideoUpdateInput = {};
    if (updates.visibility !== undefined) data.visibility = updates.visibility;
    if (updates.category !== undefined) data.category = updates.category;
    if (updates.title !== undefined) data.title = updates.title;
    if (updates.description !== undefined) data.description = updates.description;

    const updated = await prisma.video.update({ where: { id }, data });

    const visibilityChanged =
      updates.visibility !== undefined && updates.visibility !== video.visibility;

    return {
      video: updated,
      previousVisibility: video.visibility,
      visibilityChanged
    };
  },

  async listPublic(params: {
    q?: string;
    category?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Prisma.VideoWhereInput = {
      visibility: "PUBLIC",
      status: "READY",
      deletedAt: null,
      ...(params.q ? { title: { contains: params.q, mode: "insensitive" } } : {}),
      ...(params.category && isCategory(params.category) ? { category: params.category } : {})
    };

    const [items, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize
      }),
      prisma.video.count({ where })
    ]);

    const mapped = items.map((v) => publicVideoView(v));
    return { items: mapped, total };
  },

  async getPublic(id: string) {
    const video = await prisma.video.findFirst({
      where: { id, visibility: "PUBLIC", status: "READY", deletedAt: null }
    });
    if (!video) throw new HttpError(404, "Video not found");

    const streamToken = generatePublicStreamToken(id);
    const playbackUrl = `/videos/${id}/stream/hls/master.m3u8?t=${encodeURIComponent(streamToken)}`;

    incrementViewCount(id);

    return {
      ...publicVideoView(video),
      playbackUrl
    };
  },

  async heartbeat(params: {
    userId: string;
    videoId: string;
    positionSec: number;
    completed?: boolean;
  }) {
    if (!Number.isInteger(params.positionSec) || params.positionSec < 0) {
      throw new HttpError(400, "positionSec must be a non-negative integer");
    }

    // Video must exist (non-deleted) and be accessible to this user:
    // either the user owns it, or it is PUBLIC.
    const video = await prisma.video.findFirst({
      where: {
        id: params.videoId,
        deletedAt: null,
        OR: [{ userId: params.userId }, { visibility: "PUBLIC" }]
      },
      select: { id: true, userId: true, visibility: true }
    });
    if (!video) throw new HttpError(404, "Video not found");

    // Defence-in-depth: if it's not owned AND not public, refuse.
    if (video.userId !== params.userId && video.visibility !== "PUBLIC") {
      throw new HttpError(403, "Not allowed");
    }

    await prisma.watchHistory.upsert({
      where: { userId_videoId: { userId: params.userId, videoId: params.videoId } },
      update: {
        positionSec: params.positionSec,
        watchedAt: new Date(),
        completedAt: params.completed ? new Date() : undefined
      },
      create: {
        userId: params.userId,
        videoId: params.videoId,
        positionSec: params.positionSec,
        completedAt: params.completed ? new Date() : null
      }
    });

    return { ok: true as const };
  },

  async getFeatured() {
    const video = await prisma.video.findFirst({
      where: {
        featured: true,
        visibility: "PUBLIC",
        status: "READY",
        deletedAt: null
      },
      orderBy: { updatedAt: "desc" }
    });
    if (!video) return null;

    const streamToken = generatePublicStreamToken(video.id);
    const playbackUrl = `/videos/${video.id}/stream/hls/master.m3u8?t=${encodeURIComponent(streamToken)}`;
    return { ...publicVideoView(video), playbackUrl };
  }
};

function publicVideoView(v: {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  viewCount: number;
  createdAt: Date;
  duration: number | null;
  sizeBytes: bigint | null;
  thumbnailUrl: string | null;
  featured: boolean;
}) {
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    category: v.category,
    status: v.status,
    viewCount: v.viewCount,
    createdAt: v.createdAt,
    duration: v.duration,
    sizeBytes: v.sizeBytes,
    featured: v.featured,
    thumbnailUrl: v.thumbnailUrl ? publicThumbnailPath(v.id) : null,
    thumbnails: v.thumbnailUrl ? publicThumbnailSet(v.id) : null
  };
}
