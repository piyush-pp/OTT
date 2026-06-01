import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";

export type AdTranscodeJob = {
  creativeId: string;
  bucket: string;
  inputKey: string;
};

export const adTranscodeQueue = new Queue<AdTranscodeJob>("ad-transcode", {
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
