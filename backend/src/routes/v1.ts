import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { authRouter } from "./auth.js";
import { videosRouter } from "./videos.js";
import { browseRouter } from "./browse.js";
import { adminRouter } from "./admin.js";
import { shareAuthedRouter, sharePublicRouter } from "./share.js";
import { embedSnippetRouter } from "./embed.js";
import { meRouter } from "./me.js";
import { getOpenApiDocument } from "../openapi/registry.js";
import { CATEGORIES } from "../utils/categories.js";

export const v1Router = Router();

// Swagger UI lives at /api/v1/docs
const openApiDoc = getOpenApiDocument();
v1Router.get("/docs.json", (_req, res) => res.json(openApiDoc));
v1Router.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDoc));

// Categories list — no auth
v1Router.get("/categories", (_req, res) => {
  res.json({ data: CATEGORIES });
});

v1Router.use("/auth", authRouter);
// Share + embed routes that share a /videos/:id prefix must be mounted before
// the videos router so they aren't shadowed by /videos/:id GET handlers.
v1Router.use("/", shareAuthedRouter);
v1Router.use("/", embedSnippetRouter);
v1Router.use("/", sharePublicRouter);
v1Router.use("/videos", videosRouter);
v1Router.use("/browse", browseRouter);
v1Router.use("/me", meRouter);
v1Router.use("/admin", adminRouter);
