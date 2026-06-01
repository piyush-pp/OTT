import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  patchVideoAdmin,
  listUsers,
  getPlatformStats
} from "../controllers/adminController.js";
import {
  getCreativeUploadUrl,
  createCreative,
  listCreatives,
  getCreative,
  deleteCreative,
  createCampaign,
  updateCampaign,
  listCampaigns,
  getCampaign,
  deleteCampaign,
  createPlacement,
  listPlacements,
  deletePlacement,
  getAdAnalytics
} from "../controllers/adController.js";

export const adminRouter = Router();

// All admin routes require auth + admin role
adminRouter.use(requireAuth, requireAdmin);

// ─── Content & user management ────────────────────────────────────────────────
adminRouter.patch("/videos/:id", patchVideoAdmin);
adminRouter.get("/users", listUsers);
adminRouter.get("/stats", getPlatformStats);

// ─── Ad Creatives ─────────────────────────────────────────────────────────────
adminRouter.get("/ad-creatives/upload-url", getCreativeUploadUrl);
adminRouter.post("/ad-creatives", createCreative);
adminRouter.get("/ad-creatives", listCreatives);
adminRouter.get("/ad-creatives/:id", getCreative);
adminRouter.delete("/ad-creatives/:id", deleteCreative);

// ─── Campaigns ────────────────────────────────────────────────────────────────
adminRouter.post("/campaigns", createCampaign);
adminRouter.patch("/campaigns/:id", updateCampaign);
adminRouter.get("/campaigns", listCampaigns);
adminRouter.get("/campaigns/:id", getCampaign);
adminRouter.delete("/campaigns/:id", deleteCampaign);

// ─── Placements ───────────────────────────────────────────────────────────────
adminRouter.post("/placements", createPlacement);
adminRouter.get("/placements", listPlacements);
adminRouter.delete("/placements/:id", deletePlacement);

// ─── Analytics ────────────────────────────────────────────────────────────────
adminRouter.get("/ad-analytics", getAdAnalytics);
