import express, { type RequestHandler } from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./utils/env.js";
import { errorHandler, notFound } from "./utils/errors.js";
import { authRouter } from "./routes/auth.js";
import { videosRouter } from "./routes/videos.js";
import { v1Router } from "./routes/v1.js";
import { embedRouter } from "./routes/embed.js";
import { prisma } from "./db/prisma.js";

// Allow BigInt fields (e.g. Video.sizeBytes) to serialize to JSON as strings.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const app = express();

// Trust the first proxy (needed for correct req.protocol behind nginx/load balancer)
app.set("trust proxy", 1);

const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser requests (curl, health probes) and configured origins
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} is not allowed`));
    },
    credentials: true
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// v1 (current) — all new clients should target /api/v1
app.use("/api/v1", v1Router);

// Embed HTML page lives outside /api/v1 so the iframe src is short and stable.
app.use("/embed", embedRouter);

// Backward-compat — legacy paths still work but advertise deprecation.
// Legacy GET /videos additionally rewraps the new {data, meta} envelope into
// the pre-Phase-3 `{ videos: [...] }` shape so the unmigrated frontend keeps working.
const deprecationWarning: RequestHandler = (_req, res, next) => {
  res.set("Deprecation", "true");
  res.set("Sunset", "2026-12-31");
  next();
};

const legacyListShim: RequestHandler = (req, res, next) => {
  if (req.method !== "GET" || req.path !== "/") return next();
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (
      body &&
      typeof body === "object" &&
      Array.isArray((body as { data?: unknown[] }).data)
    ) {
      return originalJson({ videos: (body as { data: unknown[] }).data });
    }
    return originalJson(body);
  };
  next();
};

app.use("/auth", deprecationWarning, authRouter);
app.use("/videos", deprecationWarning, legacyListShim, videosRouter);

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`);
  console.log(`OpenAPI docs at http://localhost:${env.PORT}/api/v1/docs`);
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[backend] ${signal} received — draining`);
  server.close(() => console.log("[backend] HTTP server closed"));
  try {
    await prisma.$disconnect();
  } catch {
    // ignore disconnect errors during shutdown
  }
  setTimeout(() => process.exit(0), 5000).unref();
};

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
