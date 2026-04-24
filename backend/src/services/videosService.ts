import { randomUUID } from "node:crypto";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import { env } from "../utils/env.js";
import { HttpError } from "../utils/errors.js";
import { deleteByPrefix, presignPutObject } from "./s3.js";
import { videoTranscodeQueue } from "../queue/videoQueue.js";

function normalizeExtension(filename?: string) {
  if (!filename) return ".mp4";
  const ext = path.extname(filename);
  return ext || ".mp4";
}

export const videosService = {
  async createUploadUrl(params: {
    userId: string;
    filename?: string;
    contentType?: string;
  }) {
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

  async completeUpload(params: { userId: string; videoId: string; title: string; inputKey: string }) {
    // Prevent users from overwriting another user's IDs
    // (UUID should be unguessable, but we still enforce ownership by recording userId).
    const existing = await prisma.video.findUnique({ where: { id: params.videoId } });
    if (existing) throw new HttpError(409, "Video already exists");

    const inputUrl = `s3://${env.S3_BUCKET}/${params.inputKey}`;

    const video = await prisma.video.create({
      data: {
        id: params.videoId,
        userId: params.userId,
        title: params.title,
        status: "UPLOADED",
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

  async list(userId: string) {
    return prisma.video.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });
  },

  async get(userId: string, id: string) {
    const video = await prisma.video.findFirst({ where: { id, userId } });
    if (!video) throw new HttpError(404, "Video not found");
    return {
      ...video,
      playbackUrl: video.playbackUrl ?? (video.status === "READY" ? `${env.CDN_BASE_URL}/videos/${video.id}/hls/master.m3u8` : null)
    };
  },

  async remove(userId: string, id: string) {
    const video = await prisma.video.findFirst({ where: { id, userId } });
    if (!video) throw new HttpError(404, "Video not found");

    await Promise.all([
      deleteByPrefix({ bucket: env.S3_BUCKET, prefix: `videos/${id}/` }),
      deleteByPrefix({ bucket: env.S3_BUCKET, prefix: `uploads/${id}/` })
    ]);

    await prisma.video.delete({ where: { id } });
    return { success: true };
  }
};
