import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getHistory,
  getHistoryForVideo,
  getMyStats
} from "../controllers/meController.js";

export const meRouter = Router();

meRouter.use(requireAuth);
meRouter.get("/history", getHistory);
meRouter.get("/history/:videoId", getHistoryForVideo);
meRouter.get("/stats", getMyStats);
