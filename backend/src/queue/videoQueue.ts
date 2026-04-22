import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";

export type VideoTranscodeJob = {
  videoId: string;
  bucket: string;
  inputKey: string;
};

export const videoTranscodeQueue = new Queue<VideoTranscodeJob>("video-transcode", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: 1000,
    removeOnFail: 1000
  }
});
