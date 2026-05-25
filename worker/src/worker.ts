import { Worker } from "bullmq";
import path from "node:path";
import os from "node:os";
import { copyFile, rm } from "node:fs/promises";
import IORedis from "ioredis";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { downloadToFile, putSmallObject, uploadFile } from "./s3/io.js";
import { walkFiles } from "./fs/walk.js";
import {
  generateThumbnails,
  THUMBNAIL_SIZES,
  transcodeToHls
} from "./transcode/ffmpeg.js";

type VideoTranscodeJob = {
  videoId: string;
  bucket: string;
  inputKey: string;
};

// Dedicated publisher connection (subscriber connections in Redis can't issue
// regular commands, so use a separate pub instance).
const pub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

pub.on("error", (err) => {
  console.error("[worker] redis publisher error", err);
});

function publishProgress(videoId: string, payload: Record<string, unknown>) {
  // Fire-and-forget — never let publish failures crash the job.
  pub
    .publish(`video:${videoId}:progress`, JSON.stringify(payload))
    .catch((err) => console.error("[worker] redis publish failed", err));
}

const worker = new Worker<VideoTranscodeJob>(
  "video-transcode",
  async (job) => {
    const { videoId, bucket, inputKey } = job.data;

    await prisma.video.update({
      where: { id: videoId },
      data: { status: "PROCESSING", progress: 0, error: null }
    });
    publishProgress(videoId, { status: "PROCESSING", progress: 0 });

    const jobDir = path.join(os.tmpdir(), "ott-worker", videoId);
    const inputPath = path.join(jobDir, "input");
    const outDir = path.join(jobDir, "hls");
    const thumbDir = path.join(jobDir, "thumbs");

    try {
      await downloadToFile({ bucket, key: inputKey, filePath: inputPath });

      const { masterPlaylist } = await transcodeToHls({
        inputPath,
        outDir,
        onProgress: async ({ rendition, percent }) => {
          // Map rendition progress roughly into 0..95 and let upload set to 100.
          const renditionIndex = { "360p": 0, "720p": 1, "1080p": 2 }[rendition as "360p" | "720p" | "1080p"] ?? 0;
          const overall = Math.min(95, Math.round(((renditionIndex * 100) + percent) / 3));
          await job.updateProgress(overall);
          await prisma.video.update({
            where: { id: videoId },
            data: { progress: overall }
          });
          publishProgress(videoId, {
            status: "PROCESSING",
            progress: overall,
            rendition,
            renditionPercent: percent
          });
        }
      });

      await putSmallObject({
        bucket,
        key: `videos/${videoId}/hls/master.m3u8`,
        body: masterPlaylist,
        contentType: "application/vnd.apple.mpegurl"
      });

      // Generate three thumbnail sizes (sm/md/lg) and a legacy single-thumbnail
      // copy at the well-known path for back-compat.
      const thumbResults = await generateThumbnails({ inputPath, outDir: thumbDir });
      for (const t of thumbResults) {
        await uploadFile({
          bucket,
          key: `videos/${videoId}/thumb_${t.size.name}.jpg`,
          filePath: t.outPath,
          contentType: "image/jpeg"
        });
      }
      // Legacy thumbnail.jpg points at the medium size for back-compat.
      const mdResult = thumbResults.find((t) => t.size.name === "md") ?? thumbResults[0];
      const legacyThumbPath = path.join(thumbDir, "thumbnail.jpg");
      await copyFile(mdResult.outPath, legacyThumbPath);
      await uploadFile({
        bucket,
        key: `videos/${videoId}/thumbnail.jpg`,
        filePath: legacyThumbPath,
        contentType: "image/jpeg"
      });

      const files = await walkFiles(outDir);
      for (const filePath of files) {
        const rel = path.relative(outDir, filePath).replaceAll(path.sep, "/");
        const key = `videos/${videoId}/hls/${rel}`;
        const contentType = rel.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : rel.endsWith(".ts")
            ? "video/mp2t"
            : undefined;
        await uploadFile({ bucket, key, filePath, contentType });
      }

      const playbackUrl = `${env.CDN_BASE_URL}/videos/${videoId}/hls/master.m3u8`;
      const thumbnailUrl = `${env.CDN_BASE_URL}/videos/${videoId}/thumbnail.jpg`;

      await job.updateProgress(100);
      await prisma.video.update({
        where: { id: videoId },
        data: {
          status: "READY",
          progress: 100,
          playbackUrl,
          thumbnailUrl
        }
      });
      publishProgress(videoId, { status: "READY", progress: 100 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await prisma.video.update({
        where: { id: videoId },
        data: { status: "FAILED", error: message }
      });
      publishProgress(videoId, { status: "FAILED", error: message });
      throw err;
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  },
  {
    connection: { url: env.REDIS_URL },
    concurrency: env.WORKER_CONCURRENCY
  }
);

worker.on("ready", () => {
  console.log(
    `Worker ready: listening on queue video-transcode (concurrency=${env.WORKER_CONCURRENCY}, thumbs=${THUMBNAIL_SIZES.map((s) => s.name).join(",")})`
  );
});

worker.on("failed", (job, err) => {
  console.error("Job failed", job?.id, err);
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received — finishing current job then exiting`);
  try {
    await worker.close();
  } catch (err) {
    console.error("[worker] error closing worker", err);
  }
  try {
    await pub.quit();
  } catch {
    // ignore disconnect errors during shutdown
  }
  try {
    await prisma.$disconnect();
  } catch {
    // ignore disconnect errors during shutdown
  }
  process.exit(0);
};

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
