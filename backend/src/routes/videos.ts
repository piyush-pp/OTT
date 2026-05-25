import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { uploadLimiter, streamLimiter } from "../middleware/rateLimiter.js";
import { idempotency } from "../middleware/idempotency.js";
import {
  createUploadUrl,
  completeUpload,
  listVideos,
  getVideo,
  patchVideo,
  deleteVideo
} from "../controllers/videosController.js";
import { streamHls, streamThumbnail } from "../controllers/streamController.js";
import { videoEvents } from "../controllers/eventsController.js";
import { postHeartbeat } from "../controllers/meController.js";

export const videosRouter = Router();

// Stream endpoints use their own token auth — must come before requireAuth
videosRouter.get("/:id/stream/hls/*", streamLimiter, streamHls);

// SSE — auth resolved internally (Bearer header OR ?auth=<jwt> query param)
videosRouter.get("/:id/events", videoEvents);

// Thumbnail — accepts Bearer header OR ?auth=<jwt> query param (for <img src=>).
// Must be registered BEFORE the global requireAuth so the controller's own
// query-token fallback can run.
videosRouter.get("/:id/thumbnail", streamThumbnail);

// All remaining routes require JWT auth
videosRouter.use(requireAuth);
videosRouter.post("/upload-url", uploadLimiter, createUploadUrl);
videosRouter.post("/complete", idempotency, completeUpload);
videosRouter.get("/", listVideos);
videosRouter.delete("/:id", deleteVideo);
videosRouter.patch("/:id", patchVideo);
videosRouter.post("/:id/heartbeat", postHeartbeat);
videosRouter.get("/:id", getVideo);
