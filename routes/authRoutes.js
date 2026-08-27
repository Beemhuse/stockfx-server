import express from "express";
import { AuthController } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";
import { rateLimit, emailKey } from "../middleware/rateLimit.js";

const router = express.Router();

const registerLimiter = rateLimit({
  name: "register",
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many sign-up attempts. Please try again in an hour.",
});

const loginLimiter = rateLimit({
  name: "login",
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: emailKey,
  message: "Too many sign-in attempts. Please try again in 15 minutes.",
});

const otpVerifyLimiter = rateLimit({
  name: "otp-verify",
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: emailKey,
  message: "Too many verification attempts. Please request a new code.",
});

const otpResendLimiter = rateLimit({
  name: "otp-resend",
  windowMs: 60 * 60 * 1000,
  max: 6,
  keyGenerator: emailKey,
  message: "Too many code requests. Please try again later.",
});

router.post("/register", registerLimiter, AuthController.register);
router.post("/login", loginLimiter, AuthController.login);
router.post("/verify-otp", otpVerifyLimiter, AuthController.verifyOTP);
router.post("/resend-otp", otpResendLimiter, AuthController.resendOTP);
router.post("/logout", AuthController.logout);
router.get("/check-auth", authenticate, AuthController.checkAuth);

// Legacy aliases kept so older clients keep working.
router.post("/verify-email", otpVerifyLimiter, AuthController.verifyOTP);
router.post("/send-otp", otpResendLimiter, AuthController.resendOTP);
router.post("/resend-verification", otpResendLimiter, AuthController.resendOTP);

export default router;
