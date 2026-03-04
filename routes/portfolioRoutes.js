import express from "express";
import { PortfolioController } from "../controllers/portfolioController.js";
import { authenticate } from "../middleware/auth.js";
import { requireVerification } from "../middleware/verification.js";

const router = express.Router();

router.use(authenticate);

// Applying verification requirement to portfolio/transactions if needed
// For now, let's keep them accessible but maybe restrict trades/withdrawals in a real app
router.get("/", PortfolioController.getPortfolio);
router.get("/transactions", PortfolioController.getTransactions);

export default router;
