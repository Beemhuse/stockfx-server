import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import config, { cookieOptions } from "../config.js";
import { dbUser, dbUserAccount, dbTransaction } from "../db.js";
import { EmailService } from "../services/EmailService.js";
import {
  HttpError,
  requireAccountType,
  requireEmail,
  requireCount,
  requireMoney,
  requirePositiveAmount,
  requireText,
  requireUuid,
  formatMoney,
} from "../utils/validate.js";

const TRANSACTION_TYPES = ["deposit", "withdrawal", "send", "buy", "sell"];
const TRANSACTION_STATUSES = ["pending", "completed", "rejected"];
const USER_STATUSES = ["active", "suspended"];
const KYC_STATUSES = ["pending", "approved", "rejected"];

/** Flatten a user + account row into the shape the admin UI consumes. */
const presentUser = (user) => {
  const account = user.account || {};
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    status: user.status || "active",
    is_admin: user.is_admin === true,
    is_verified: user.is_verified === true,
    created_at: user.created_at,

    balance: Number(account.balance ?? 0),
    total_investment: Number(account.total_investment ?? 0),
    total_profit: Number(account.total_profit ?? 0),
    monthly_income: Number(account.monthly_income ?? 0),
    active_trades: Number(account.active_trades ?? 0),
    account_type: account.account_type || "standard",
    kyc_status: account.kyc_status || "pending",

    // camelCase aliases kept for older clients
    totalInvestment: Number(account.total_investment ?? 0),
    totalProfit: Number(account.total_profit ?? 0),
    monthlyIncome: Number(account.monthly_income ?? 0),
    activeTrades: Number(account.active_trades ?? 0),
    accountType: account.account_type || "standard",
  };
};

export const AdminController = {
  /**
   * Dedicated admin sign-in. Issues the same user session token (so the normal
   * `authenticate` middleware works) plus an `admin_token` cookie.
   */
  async login(req, res, next) {
    try {
      const email = requireEmail(req.body?.email);
      const password = req.body?.password;
      if (typeof password !== "string" || !password) {
        throw new HttpError(400, "Password is required", "MISSING_PASSWORD");
      }

      const user = await dbUser.findByEmail(email);
      const ok =
        user?.is_admin &&
        user.password_hash &&
        (await bcrypt.compare(password, user.password_hash));

      if (!ok) {
        throw new HttpError(401, "Invalid admin credentials", "INVALID_CREDENTIALS");
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email, is_admin: true },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn },
      );

      res.cookie("admin_token", token, cookieOptions());
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          is_admin: true,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async listUsers(req, res, next) {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const users = await dbUser.list(limit, offset);
      res.json(users.map(presentUser));
    } catch (err) {
      next(err);
    }
  },

  async getUser(req, res, next) {
    try {
      const userId = requireUuid(req.params.userId, "user id");
      const [user] = await Promise.all([dbUser.findById(userId)]);
      if (!user) throw new HttpError(404, "User not found", "NOT_FOUND");
      const account = await dbUserAccount.ensure(userId);
      const transactions = await dbTransaction.list(userId);
      res.json({ user: presentUser({ ...user, account }), transactions });
    } catch (err) {
      next(err);
    }
  },

  /** Set a user's balance to an exact figure. */
  async updateBalance(req, res, next) {
    try {
      const userId = requireUuid(req.body?.userId, "user id");
      const balance = requireMoney(req.body?.balance, "Balance");

      const user = await dbUser.findById(userId);
      if (!user) throw new HttpError(404, "User not found", "NOT_FOUND");

      const account = await dbUserAccount.updateBalance(userId, balance);
      await EmailService.sendBalanceUpdate(user.email, user.name, balance);

      res.json({ success: true, account, user: presentUser({ ...user, account }) });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Update any combination of the user's financial figures:
   * balance, total investment, total profit, monthly income, account type,
   * KYC status. Only the fields present in the body are changed.
   */
  async updateStats(req, res, next) {
    try {
      const userId = requireUuid(req.body?.userId, "user id");
      const body = req.body || {};

      const user = await dbUser.findById(userId);
      if (!user) throw new HttpError(404, "User not found", "NOT_FOUND");

      const stats = {};
      const changes = [];

      const pick = (...keys) =>
        keys.map((k) => body[k]).find((v) => v !== undefined && v !== null && v !== "");

      const balance = pick("balance");
      if (balance !== undefined) {
        stats.balance = requireMoney(balance, "Balance");
        changes.push({ label: "Balance", value: `$${formatMoney(stats.balance)}` });
      }

      const totalInvestment = pick("totalInvestment", "total_investment");
      if (totalInvestment !== undefined) {
        stats.totalInvestment = requireMoney(totalInvestment, "Total investment");
        changes.push({
          label: "Total investment",
          value: `$${formatMoney(stats.totalInvestment)}`,
        });
      }

      const totalProfit = pick("totalProfit", "total_profit");
      if (totalProfit !== undefined) {
        // Profit may legitimately be negative (a loss).
        stats.totalProfit = requireMoney(totalProfit, "Total profit", {
          allowNegative: true,
        });
        changes.push({
          label: "Total profit",
          value: `$${formatMoney(stats.totalProfit)}`,
        });
      }

      const monthlyIncome = pick("monthlyIncome", "monthly_income");
      if (monthlyIncome !== undefined) {
        stats.monthlyIncome = requireMoney(monthlyIncome, "Monthly income", {
          allowNegative: true,
        });
        changes.push({
          label: "Monthly income",
          value: `$${formatMoney(stats.monthlyIncome)}`,
        });
      }

      const activeTrades = pick("activeTrades", "active_trades");
      if (activeTrades !== undefined) {
        stats.activeTrades = requireCount(activeTrades, "Active trades");
        changes.push({
          label: "Active trades",
          value: String(stats.activeTrades),
        });
      }

      const accountType = pick("accountType", "account_type");
      if (accountType !== undefined) {
        stats.accountType = requireAccountType(accountType);
        changes.push({ label: "Account type", value: stats.accountType });
      }

      const kycStatus = pick("kycStatus", "kyc_status");
      if (kycStatus !== undefined) {
        if (!KYC_STATUSES.includes(String(kycStatus).toLowerCase())) {
          throw new HttpError(
            400,
            `KYC status must be one of: ${KYC_STATUSES.join(", ")}`,
            "INVALID_KYC_STATUS",
          );
        }
        stats.kycStatus = String(kycStatus).toLowerCase();
        changes.push({ label: "KYC status", value: stats.kycStatus });
      }

      if (Object.keys(stats).length === 0) {
        throw new HttpError(400, "No values to update", "NOTHING_TO_UPDATE");
      }

      const account = await dbUserAccount.updateStats(userId, stats);

      if (body.notify !== false) {
        await EmailService.sendStatsUpdate(user.email, user.name, changes);
      }

      res.json({
        success: true,
        account,
        user: presentUser({ ...user, account }),
      });
    } catch (err) {
      next(err);
    }
  },

  /** Activate or suspend a user account. */
  async updateUserStatus(req, res, next) {
    try {
      const userId = requireUuid(req.body?.userId, "user id");
      const status = String(req.body?.status || "").toLowerCase();
      if (!USER_STATUSES.includes(status)) {
        throw new HttpError(
          400,
          `Status must be one of: ${USER_STATUSES.join(", ")}`,
          "INVALID_STATUS",
        );
      }

      const user = await dbUser.findById(userId);
      if (!user) throw new HttpError(404, "User not found", "NOT_FOUND");
      if (user.is_admin) {
        throw new HttpError(
          400,
          "Administrator accounts cannot be suspended",
          "FORBIDDEN_TARGET",
        );
      }

      const updated = await dbUser.setStatus(userId, status);

      res.json({ success: true, user: presentUser(updated) });
    } catch (err) {
      next(err);
    }
  },

  async deleteUser(req, res, next) {
    try {
      const userId = requireUuid(req.params.userId, "user id");

      const user = await dbUser.findById(userId);
      if (!user) throw new HttpError(404, "User not found", "NOT_FOUND");
      if (user.is_admin || user.id === req.user.id) {
        throw new HttpError(
          400,
          "Administrator accounts cannot be deleted",
          "FORBIDDEN_TARGET",
        );
      }

      await dbUser.delete(userId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  async listTransactions(req, res, next) {
    try {
      const limit = Math.min(Number(req.query.limit) || 200, 500);
      res.json(await dbTransaction.listAll(limit));
    } catch (err) {
      next(err);
    }
  },

  /**
   * Manually record a transaction. When created as `completed` the user's
   * balance is moved immediately; `pending` rows go through the approval queue.
   */
  async createTransaction(req, res, next) {
    try {
      const userId = requireUuid(req.body?.userId, "user id");
      const type = String(req.body?.type || "").toLowerCase();
      if (!TRANSACTION_TYPES.includes(type)) {
        throw new HttpError(
          400,
          `Type must be one of: ${TRANSACTION_TYPES.join(", ")}`,
          "INVALID_TYPE",
        );
      }
      const amount = requirePositiveAmount(req.body?.amount);
      const status = TRANSACTION_STATUSES.includes(req.body?.status)
        ? req.body.status
        : "pending";
      const debit = ["withdrawal", "send", "buy"].includes(type);

      const user = await dbUser.findById(userId);
      if (!user) throw new HttpError(404, "User not found", "NOT_FOUND");

      const tx = await dbTransaction.create({
        userId,
        type,
        symbol: req.body?.symbol ? requireText(req.body.symbol, "Symbol", 64) : null,
        quantity:
          req.body?.quantity !== undefined ? Number(req.body.quantity) : null,
        price: req.body?.price !== undefined ? Number(req.body.price) : null,
        amount,
        status: status === "completed" ? "pending" : status,
      });

      // A row recorded as already completed must move money now; settle()
      // does the status flip and the balance change in one DB transaction.
      if (status === "completed") {
        try {
          await dbTransaction.settle(tx.id, { debit });
        } catch (err) {
          if (err.code === "INSUFFICIENT_FUNDS") {
            await dbTransaction.updateStatus(tx.id, "rejected");
            throw new HttpError(
              400,
              `Insufficient balance: the user has $${formatMoney(err.balance)}.`,
              "INSUFFICIENT_FUNDS",
            );
          }
          throw err;
        }
      }

      res.status(201).json({ success: true, transaction: tx });
    } catch (err) {
      next(err);
    }
  },

  async approveTransaction(req, res, next) {
    try {
      const txId = requireUuid(req.body?.txId, "transaction id");

      const existing = await dbTransaction.findById(txId);
      if (!existing) throw new HttpError(404, "Transaction not found", "NOT_FOUND");
      if (existing.status !== "pending") {
        throw new HttpError(
          409,
          `This transaction is already ${existing.status}.`,
          "ALREADY_PROCESSED",
        );
      }

      const debit = ["withdrawal", "send", "buy"].includes(existing.type);

      let result;
      try {
        result = await dbTransaction.settle(txId, { debit });
      } catch (err) {
        if (err.code === "INSUFFICIENT_FUNDS") {
          throw new HttpError(
            400,
            `Insufficient balance: the user has $${formatMoney(err.balance)}.`,
            "INSUFFICIENT_FUNDS",
          );
        }
        throw err;
      }

      if (!result) {
        throw new HttpError(
          409,
          "This transaction was already processed.",
          "ALREADY_PROCESSED",
        );
      }

      const { transaction, account } = result;
      const amount = Number(transaction.amount) || 0;
      if (debit) {
        await EmailService.sendDebitAlert(
          transaction.user.email,
          transaction.user.name,
          amount,
        );
      } else {
        await EmailService.sendDepositAlert(
          transaction.user.email,
          transaction.user.name,
          amount,
        );
      }

      res.json({
        success: true,
        message: "Transaction approved",
        balance: Number(account.balance || 0),
      });
    } catch (err) {
      next(err);
    }
  },

  async rejectTransaction(req, res, next) {
    try {
      const txId = requireUuid(req.body?.txId, "transaction id");

      const transaction = await dbTransaction.reject(txId);
      if (!transaction) {
        throw new HttpError(
          409,
          "This transaction is not pending and cannot be rejected.",
          "ALREADY_PROCESSED",
        );
      }

      await EmailService.sendTransactionRejected(
        transaction.user.email,
        transaction.user.name,
        transaction.type,
        Number(transaction.amount) || 0,
      );

      res.json({ success: true, message: "Transaction rejected" });
    } catch (err) {
      next(err);
    }
  },

  async sendNotification(req, res, next) {
    try {
      const userId = requireUuid(req.body?.userId, "user id");
      const message = requireText(req.body?.message, "Message", 2000);

      const user = await dbUser.findById(userId);
      if (!user) throw new HttpError(404, "User not found", "NOT_FOUND");

      const result = await EmailService.sendAdminNotification(
        user.email,
        user.name,
        message,
      );
      if (!result.sent && config.isProd) {
        throw new HttpError(
          502,
          "The notification could not be delivered.",
          "EMAIL_SEND_FAILED",
        );
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};

export default AdminController;
