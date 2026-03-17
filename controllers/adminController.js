import jwt from "jsonwebtoken";
import { dbUser, dbUserAccount, dbTransaction } from "../db.js";
import { EmailService } from "../services/EmailService.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

import bcrypt from "bcryptjs";

export const AdminController = {
  async login(req, res) {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.toLowerCase().trim()
        : "";
    const password = req.body?.password;

    if (!email || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password required" });
    }

    try {
      const user = await dbUser.findByEmail(email);
      if (user && user.is_admin && user.password_hash) {
        const ok = await bcrypt.compare(password, user.password_hash);
        if (ok) {
          const token = jwt.sign(
            { id: user.id, email: user.email, role: "admin", isAdmin: true },
            JWT_SECRET,
            {
              expiresIn: "7d",
            },
          );
          res.cookie("admin_token", token, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });
          return res.json({
            success: true,
            token,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              is_admin: true,
            },
          });
        }
      }
    } catch (err) {
      console.error("Admin login error:", err);
    }

    res.status(401).json({ error: "Invalid admin credentials" });
  },

  async listUsers(req, res) {
    try {
      const users = await dbUser.list(100, 0);
      const usersWithBalances = await Promise.all(
        users.map(async (u) => {
          const { password_hash, verification_token, ...safeUser } = u;
          const acc = await dbUserAccount.getByUserId(u.id);
          return { ...safeUser, balance: acc?.balance || 0 };
        }),
      );
      res.json(usersWithBalances);
    } catch (err) {
      res.status(500).json({ error: "Failed to list users" });
    }
  },

  async updateBalance(req, res) {
    const { userId, balance } = req.body;
    if (!userId || balance === undefined)
      return res.status(400).json({ error: "UserId and balance required" });

    try {
      const updated = await dbUserAccount.updateBalance(userId, balance);
      const user = await dbUser.findById(userId);
      if (user) {
        await EmailService.sendBalanceUpdate(user.email, user.name, balance);
      }
      res.json({ success: true, account: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update balance" });
    }
  },

  async updateStats(req, res) {
    const { userId, totalInvestment, accountType } = req.body;
    if (!userId) return res.status(400).json({ error: "UserId required" });

    try {
      const updated = await dbUserAccount.updateStats(userId, {
        totalInvestment,
        accountType,
      });
      res.json({ success: true, account: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update stats" });
    }
  },

  async deleteUser(req, res) {
    const { userId } = req.params;
    try {
      await dbUser.delete(userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  },

  async listTransactions(req, res) {
    try {
      const transactions = await dbTransaction.listAll();
      res.json(transactions);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch all transactions" });
    }
  },

  async createTransaction(req, res) {
    const { userId, type, symbol, quantity, price, amount, status } = req.body;
    if (!userId || !type || !amount)
      return res.status(400).json({ error: "Missing fields" });

    try {
      const tx = await dbTransaction.create({
        userId,
        type,
        symbol,
        quantity,
        price,
        amount,
        status,
      });
      res.json({ success: true, transaction: tx });
    } catch (err) {
      res.status(500).json({ error: "Failed to create transaction" });
    }
  },

  async sendNotification(req, res) {
    const { userId, message } = req.body;
    if (!userId || !message)
      return res.status(400).json({ error: "UserId and message required" });

    try {
      const user = await dbUser.findById(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      await EmailService.sendAdminNotification(user.email, user.name, message);
      console.log(`[NOTIFICATION] Sent to ${user.email}: ${message}`);
      res.json({ success: true });
    } catch (err) {
      console.error("sendNotification error:", err);
      res.status(500).json({ error: "Failed to send notification" });
    }
  },

  async approveTransaction(req, res) {
    const { txId } = req.body;
    if (!txId)
      return res.status(400).json({ error: "Transaction ID required" });

    try {
      const tx = await dbTransaction.findById(txId);
      if (!tx) return res.status(404).json({ error: "Transaction not found" });
      if (tx.status !== "pending")
        return res
          .status(400)
          .json({ error: "Transaction is already processed" });

      // Approve
      await dbTransaction.updateStatus(txId, "completed");

      // Balance adjustment
      const amount = parseFloat(tx.amount);
      if (tx.type === "deposit") {
        await dbUserAccount.incrementBalance(tx.user_id, amount);
        await EmailService.sendDepositAlert(
          tx.user.email,
          tx.user.name,
          amount,
        );
      } else if (tx.type === "withdrawal" || tx.type === "send") {
        // For withdrawals/sends, we might want to deduct balance when the REQUEST is made
        // or when it is APPROVED. Based on the prompt "approved by admin after approving the request",
        // it implies the balance change happens at approval.
        await dbUserAccount.incrementBalance(tx.user_id, -amount);
        await EmailService.sendDebitAlert(tx.user.email, tx.user.name, amount);
      }

      res.json({ success: true, message: "Transaction approved" });
    } catch (err) {
      console.error("Approval error:", err);
      res.status(500).json({ error: "Failed to approve transaction" });
    }
  },

  async rejectTransaction(req, res) {
    const { txId } = req.body;
    if (!txId)
      return res.status(400).json({ error: "Transaction ID required" });

    try {
      const tx = await dbTransaction.findById(txId);
      if (!tx) return res.status(404).json({ error: "Transaction not found" });

      await dbTransaction.updateStatus(txId, "rejected");
      res.json({ success: true, message: "Transaction rejected" });
    } catch (err) {
      console.error("Rejection error:", err);
      res.status(500).json({ error: "Failed to reject transaction" });
    }
  },
};
