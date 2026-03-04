import express from "express";
import { AdminController } from "../controllers/adminController.js";
import { authenticate } from "../middleware/auth.js";
import { isAdmin } from "../middleware/admin.js";

const router = express.Router();

router.post("/login", AdminController.login);

// All other admin routes require auth AND isAdmin
router.use(authenticate, isAdmin);

router.get("/users", AdminController.listUsers);
router.post("/update-balance", AdminController.updateBalance);
router.post("/update-stats", AdminController.updateStats);
router.delete("/users/:userId", AdminController.deleteUser);
router.get("/transactions", AdminController.listTransactions);
router.post("/transactions", AdminController.createTransaction);
router.post("/approve-transaction", AdminController.approveTransaction);
router.post("/reject-transaction", AdminController.rejectTransaction);
router.post("/send-notification", AdminController.sendNotification);

export default router;
