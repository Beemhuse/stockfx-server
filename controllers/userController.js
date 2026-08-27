import {
  dbUser,
  dbUserAccount,
  dbDevice,
  dbSession,
  dbTransaction,
  dbPortfolio,
} from "../db.js";
import { HttpError, requireText } from "../utils/validate.js";

const safeUser = (user) => {
  const { password_hash, verification_token, ...rest } = user;
  return rest;
};

export const UserController = {
  async getMe(req, res) {
    res.json({ user: safeUser(req.user) });
  },

  async updateProfile(req, res, next) {
    try {
      const patch = {};
      if (req.body?.name !== undefined) {
        patch.name = requireText(req.body.name, "Name", 120);
      }
      if (req.body?.phone !== undefined) {
        patch.phone = req.body.phone
          ? requireText(req.body.phone, "Phone", 32)
          : null;
      }
      if (req.body?.avatarUrl !== undefined) {
        patch.avatarUrl = req.body.avatarUrl
          ? requireText(req.body.avatarUrl, "Avatar URL", 500)
          : null;
      }
      if (Object.keys(patch).length === 0) {
        throw new HttpError(400, "Nothing to update", "NOTHING_TO_UPDATE");
      }

      const updated = await dbUser.updateProfile(req.user.id, patch);
      res.json({ success: true, user: safeUser(updated) });
    } catch (err) {
      next(err);
    }
  },

  async getDashboard(req, res, next) {
    try {
      const [account, devices, transactions, portfolio] = await Promise.all([
        dbUserAccount.ensure(req.user.id),
        dbDevice.list(req.user.id),
        dbTransaction.list(req.user.id),
        dbPortfolio.getByUserId(req.user.id),
      ]);

      const pendingDebits = await dbTransaction.pendingDebitTotal(req.user.id);
      const balance = Number(account.balance ?? 0);

      res.json({
        user: {
          ...safeUser(req.user),
          balance,
          availableBalance: Math.max(0, balance - pendingDebits),
          pendingDebits,
          totalInvestment: Number(account.total_investment ?? 0),
          totalProfit: Number(account.total_profit ?? 0),
          monthlyIncome: Number(account.monthly_income ?? 0),
          // Admin-managed figure; falls back to the real portfolio row count.
          activeTrades: Number(account.active_trades ?? 0) || portfolio.length,
          account_type: account.account_type || "standard",
          kyc_status: account.kyc_status || "pending",
          recentTransactions: transactions.slice(0, 5),
          transactions,
          portfolio,
        },
        devices,
      });
    } catch (err) {
      next(err);
    }
  },

  async listDevices(req, res, next) {
    try {
      res.json({ devices: await dbDevice.list(req.user.id) });
    } catch (err) {
      next(err);
    }
  },

  async removeDevice(req, res, next) {
    try {
      const deviceId = requireText(
        req.body?.deviceId ?? req.params?.deviceId,
        "Device id",
        128,
      );
      await dbDevice.remove(req.user.id, deviceId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  async manageDevices(req, res, next) {
    try {
      const action = req.body?.action;
      if (action === "logout_all") {
        await dbSession.deactivateAll(req.user.id);
        return res.json({ success: true });
      }
      if (action === "remove_device") {
        return UserController.removeDevice(req, res, next);
      }
      throw new HttpError(400, "Unknown action", "INVALID_ACTION");
    } catch (err) {
      next(err);
    }
  },
};

export default UserController;
