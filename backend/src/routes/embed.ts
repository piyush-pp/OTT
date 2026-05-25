import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { embedHtml, getEmbedSnippet } from "../controllers/embedController.js";

/**
 * Public embed HTML page — mounted at /embed (outside /api/v1).
 *
 *   GET /embed/:id → HTML page with Video.js loaded for a PUBLIC video.
 */
export const embedRouter = Router();
embedRouter.get("/:id", embedHtml);

/**
 * Embed-snippet JSON endpoint — mounted at /api/v1/videos/:id/embed.
 * Authed; works for any PUBLIC video (not just the owner's). requireAuth is
 * attached per-route so non-matching paths fall through to the next router.
 */
export const embedSnippetRouter = Router();
embedSnippetRouter.get("/videos/:id/embed", requireAuth, getEmbedSnippet);
