import { dbPortfolio, dbTransaction } from "../db.js";

export const PortfolioController = {
  async getPortfolio(req, res, next) {
    try {
      res.json(await dbPortfolio.getByUserId(req.user.id));
    } catch (err) {
      next(err);
    }
  },

  async getTransactions(req, res, next) {
    try {
      res.json(await dbTransaction.list(req.user.id));
    } catch (err) {
      next(err);
    }
  },
};

export default PortfolioController;
