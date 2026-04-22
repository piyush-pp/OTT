import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./utils/env.js";
import { errorHandler, notFound } from "./utils/errors.js";
import { authRouter } from "./routes/auth.js";
import { videosRouter } from "./routes/videos.js";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", authRouter);
app.use("/videos", videosRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`);
});
