import { dbPortfolio, dbTransaction } from "../db.js";

export const PortfolioController = {
  async getPortfolio(req, res) {
    try {
      const portfolio = await dbPortfolio.getByUserId(req.user.id);
      res.json(portfolio);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch portfolio" });
    }
  },

  async getTransactions(req, res) {
    try {
      const transactions = await dbTransaction.list(req.user.id);
      res.json(transactions);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  },
};
