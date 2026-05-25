import { z } from "zod";
import "dotenv/config";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  REDIS_URL: z.string().min(1),
  CDN_BASE_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // CORS – comma-separated list of allowed origins
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  // Email (all optional; omit to fall back to console logging in dev)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("noreply@ott.local"),
  // Upload limits
  MAX_UPLOAD_BYTES: z.coerce.number().default(2 * 1024 * 1024 * 1024), // 2 GB
  // Public-facing base URL — used to build share URLs and embed iframe src.
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000")
});

export const env = schema.parse(process.env);
