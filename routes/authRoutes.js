import express from "express";
import { AuthController } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/send-otp", AuthController.sendOTP);
router.post("/verify-otp", AuthController.verifyOTP);
router.post("/register", AuthController.register);
router.post("/login", AuthController.login);
router.post("/logout", AuthController.logout);
router.get("/check-auth", authenticate, AuthController.checkAuth);
router.post("/verify-email", AuthController.verifyEmail);
router.post(
  "/resend-verification",
  authenticate,
  AuthController.resendVerification,
);
router.post("/logout", AuthController.logout);

export default router;
