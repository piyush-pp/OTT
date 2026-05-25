import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createShare,
  resolveShare,
  revokeShare,
  listShares
} from "../controllers/shareController.js";

/**
 * Authenticated share routes — mounted at /api/v1. requireAuth is attached
 * per-route (rather than as router-level middleware) so the unauthenticated
 * /share/:token resolver isn't accidentally fenced when the routers are
 * sequenced at the v1 root mount.
 *
 *   POST   /videos/:id/share    → create a new share link (owner)
 *   GET    /videos/:id/shares   → list active share links for a video (owner)
 *   DELETE /shares/:id          → revoke a share link (owner)
 */
export const shareAuthedRouter = Router();
shareAuthedRouter.post("/videos/:id/share", requireAuth, createShare);
shareAuthedRouter.get("/videos/:id/shares", requireAuth, listShares);
shareAuthedRouter.delete("/shares/:id", requireAuth, revokeShare);

/**
 * Public share resolver — mounted at /api/v1.
 *
 *   GET /share/:token → resolve a share token (no auth)
 */
export const sharePublicRouter = Router();
sharePublicRouter.get("/share/:token", resolveShare);
