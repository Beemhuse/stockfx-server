import express from "express";
import { UserController } from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

router.get("/me", UserController.getMe);
router.put("/profile", UserController.updateProfile);
router.get("/dashboard", UserController.getDashboard);
router.get("/devices", UserController.listDevices);
router.post("/manage-devices", UserController.manageDevices);

// Transaction Requests
import { TransactionController } from "../controllers/transactionController.js";
router.post("/deposit", TransactionController.requestDeposit);
router.post("/withdraw", TransactionController.requestWithdrawal);
router.post("/send", TransactionController.requestSend);

export default router;
