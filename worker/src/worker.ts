import { Worker } from "bullmq";
import path from "node:path";
import os from "node:os";
import { rm } from "node:fs/promises";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { downloadToFile, putSmallObject, uploadFile } from "./s3/io.js";
import { walkFiles } from "./fs/walk.js";
import { generateThumbnail, transcodeToHls } from "./transcode/ffmpeg.js";

type VideoTranscodeJob = {
  videoId: string;
  bucket: string;
  inputKey: string;
};

const worker = new Worker<VideoTranscodeJob>(
  "video-transcode",
  async (job) => {
    const { videoId, bucket, inputKey } = job.data;

    await prisma.video.update({
      where: { id: videoId },
      data: { status: "PROCESSING", progress: 0, error: null }
    });

    const jobDir = path.join(os.tmpdir(), "ott-worker", videoId);
    const inputPath = path.join(jobDir, "input");
    const outDir = path.join(jobDir, "hls");
    const thumbPath = path.join(jobDir, "thumb.jpg");

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
        }
      });

      await putSmallObject({
        bucket,
        key: `videos/${videoId}/hls/master.m3u8`,
        body: masterPlaylist,
        contentType: "application/vnd.apple.mpegurl"
      });

      await generateThumbnail({ inputPath, outPath: thumbPath });
      await uploadFile({
        bucket,
        key: `videos/${videoId}/thumbnail.jpg`,
        filePath: thumbPath,
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await prisma.video.update({
        where: { id: videoId },
        data: { status: "FAILED", error: message }
      });
      throw err;
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  },
  {
    connection: { url: env.REDIS_URL },
    concurrency: 1
  }
);

worker.on("ready", () => {
  console.log("Worker ready: listening on queue video-transcode");
});

worker.on("failed", (job, err) => {
  console.error("Job failed", job?.id, err);
});
