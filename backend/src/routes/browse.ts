import { Router } from "express";
import {
  listPublicVideos,
  getFeaturedVideo,
  getPublicVideo,
  streamPublicThumbnail
} from "../controllers/browseController.js";

export const browseRouter = Router();

browseRouter.get("/", listPublicVideos);
browseRouter.get("/featured", getFeaturedVideo);
browseRouter.get("/:id/thumbnail", streamPublicThumbnail);
browseRouter.get("/:id", getPublicVideo);
