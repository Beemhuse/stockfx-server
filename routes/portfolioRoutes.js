import express from "express";
import { PortfolioController } from "../controllers/portfolioController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.use(authenticate);

router.get("/", PortfolioController.getPortfolio);
router.get("/transactions", PortfolioController.getTransactions);

export default router;
