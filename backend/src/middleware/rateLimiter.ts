import rateLimit from "express-rate-limit";

// 10 auth attempts per IP per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" }
});

// 30 upload-url requests per IP per hour
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Upload limit reached, please try again in an hour" }
});

// 600 stream requests per IP per minute — high enough for normal HLS playback,
// blocks abuse / scraping. Applied to the HLS proxy only.
export const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Stream rate limit exceeded" }
});
