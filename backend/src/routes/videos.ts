import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createUploadUrl,
  completeUpload,
  listVideos,
  getVideo,
  deleteVideo
} from "../controllers/videosController.js";

export const videosRouter = Router();

videosRouter.use(requireAuth);
videosRouter.post("/upload-url", createUploadUrl);
videosRouter.post("/complete", completeUpload);
videosRouter.get("/", listVideos);
videosRouter.delete("/:id", deleteVideo);
videosRouter.get("/:id", getVideo);
