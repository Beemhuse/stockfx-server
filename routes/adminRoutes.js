import express from "express";
import { AdminController } from "../controllers/adminController.js";
import { authenticate } from "../middleware/auth.js";
import { isAdmin } from "../middleware/admin.js";
import { rateLimit, emailKey } from "../middleware/rateLimit.js";

const router = express.Router();

router.post(
  "/login",
  rateLimit({
    name: "admin-login",
    windowMs: 15 * 60 * 1000,
    max: 8,
    keyGenerator: emailKey,
    message: "Too many admin sign-in attempts. Please try again later.",
  }),
  AdminController.login,
);

// Everything below requires a valid session whose DB row has is_admin = true.
router.use(authenticate, isAdmin);

router.get("/users", AdminController.listUsers);
router.get("/users/:userId", AdminController.getUser);
router.delete("/users/:userId", AdminController.deleteUser);

router.post("/update-balance", AdminController.updateBalance);
router.post("/update-stats", AdminController.updateStats);
router.post("/update-status", AdminController.updateUserStatus);

router.get("/transactions", AdminController.listTransactions);
router.post("/transactions", AdminController.createTransaction);
router.post("/approve-transaction", AdminController.approveTransaction);
router.post("/reject-transaction", AdminController.rejectTransaction);

router.post("/send-notification", AdminController.sendNotification);

export default router;
