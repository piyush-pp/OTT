import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import {
  signup,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification
} from "../controllers/authController.js";

export const authRouter = Router();

authRouter.post("/signup", authLimiter, signup);
authRouter.post("/login", authLimiter, login);
authRouter.post("/refresh", authLimiter, refresh);
authRouter.post("/logout", logout);
authRouter.post("/forgot-password", authLimiter, forgotPassword);
authRouter.post("/reset-password", authLimiter, resetPassword);
authRouter.get("/verify-email", verifyEmail);
authRouter.post("/resend-verification", requireAuth, resendVerification);
