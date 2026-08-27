import express from "express";
import { UserController } from "../controllers/userController.js";
import { TransactionController } from "../controllers/transactionController.js";
import { authenticate } from "../middleware/auth.js";
import { requireVerification } from "../middleware/verification.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

router.use(authenticate);

const transactionLimiter = rateLimit({
  name: "transactions",
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || "anonymous",
  message: "Too many requests. Please slow down.",
});

router.get("/me", UserController.getMe);
router.put("/profile", UserController.updateProfile);
router.get("/dashboard", UserController.getDashboard);

router.get("/devices", UserController.listDevices);
router.post("/manage-devices", UserController.manageDevices);
router.get("/manage-devices", UserController.listDevices);
router.delete("/manage-devices", UserController.removeDevice);

// Money movement always requires a verified email address.
router.post(
  "/deposit",
  transactionLimiter,
  requireVerification,
  TransactionController.requestDeposit,
);
router.post(
  "/withdraw",
  transactionLimiter,
  requireVerification,
  TransactionController.requestWithdrawal,
);
router.post(
  "/send",
  transactionLimiter,
  requireVerification,
  TransactionController.requestSend,
);

export default router;
