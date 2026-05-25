import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  patchVideoAdmin,
  listUsers,
  getPlatformStats
} from "../controllers/adminController.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.patch("/videos/:id", patchVideoAdmin);
adminRouter.get("/users", listUsers);
adminRouter.get("/stats", getPlatformStats);
