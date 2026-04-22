import { Router } from "express";
import { signup, login } from "../controllers/authController.js";

export const authRouter = Router();

authRouter.post("/signup", signup);
authRouter.post("/login", login);
