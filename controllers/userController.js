import {
  dbUser,
  dbUserAccount,
  dbDevice,
  dbSession,
  dbTransaction,
  dbPortfolio,
} from "../db.js";

export const UserController = {
  async getMe(req, res) {
    const { password_hash, verification_token, ...safeUser } = req.user;
    res.json({ user: safeUser });
  },

  async updateProfile(req, res) {
    const { name, phone, avatarUrl } = req.body;
    try {
      const updated = await dbUser.updateProfile(req.user.id, {
        name,
        phone,
        avatarUrl,
      });
      const { password_hash, verification_token, ...safeUser } = updated;
      res.json({ success: true, user: safeUser });
    } catch (err) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  },

  async getDashboard(req, res) {
    try {
      const { password_hash, verification_token, ...safeUser } = req.user;
      const account = await dbUserAccount.getByUserId(req.user.id);
      const devices = await dbDevice.list(req.user.id);
      const transactions = await dbTransaction.list(req.user.id);
      const portfolio = await dbPortfolio.getByUserId(req.user.id);

      // Use account stats if available
      const totalProfit = account?.total_profit || 0;
      const monthlyIncome = account?.monthly_income || 0;
      const totalInvestment = account?.total_investment || 0;
      const activeTrades = portfolio.length;

      res.json({
        user: {
          ...safeUser,
          balance: account?.balance || 0,
          totalInvestment,
          totalProfit,
          monthlyIncome,
          activeTrades,
          account_type: account?.account_type || "standard",
          recentTransactions: transactions.slice(0, 5),
          transactions: transactions,
          portfolio: portfolio,
        },
        devices,
      });
    } catch (err) {
      console.error("Dashboard error:", err);
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  },

  async manageDevices(req, res) {
    const { action } = req.body;
    try {
      if (action === "logout_all") {
        await dbSession.deactivateAll(req.user.id);
        return res.json({ success: true });
      }
      res.status(400).json({ error: "Invalid action" });
    } catch (err) {
      res.status(500).json({ error: "Action failed" });
    }
  },

  async listDevices(req, res) {
    try {
      const devices = await dbDevice.list(req.user.id);
      res.json({ devices });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch devices" });
    }
  },
};
