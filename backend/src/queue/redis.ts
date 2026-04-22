import { env } from "../utils/env.js";

export const redisConnection = {
  url: env.REDIS_URL
};
