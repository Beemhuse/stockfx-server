import { dbTransaction } from "../db.js";

export const TransactionController = {
  async requestDeposit(req, res) {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount required" });
    }

    try {
      const tx = await dbTransaction.create({
        userId: req.user.id,
        type: "deposit",
        amount: parseFloat(amount),
        status: "pending",
      });
      res.json({
        success: true,
        transaction: tx,
        message: "Deposit request submitted for approval",
      });
    } catch (err) {
      console.error("Deposit request error:", err);
      res.status(500).json({ error: "Failed to submit deposit request" });
    }
  },

  async requestWithdrawal(req, res) {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount required" });
    }

    try {
      const tx = await dbTransaction.create({
        userId: req.user.id,
        type: "withdrawal",
        amount: parseFloat(amount),
        status: "pending",
      });
      res.json({
        success: true,
        transaction: tx,
        message: "Withdrawal request submitted for approval",
      });
    } catch (err) {
      console.error("Withdrawal request error:", err);
      res.status(500).json({ error: "Failed to submit withdrawal request" });
    }
  },

  async requestSend(req, res) {
    const { amount, recipient } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount required" });
    }

    try {
      const tx = await dbTransaction.create({
        userId: req.user.id,
        type: "send",
        amount: parseFloat(amount),
        symbol: recipient, // Using symbol field effectively for recipient name/email
        status: "pending",
      });
      res.json({
        success: true,
        transaction: tx,
        message: "Send request submitted for approval",
      });
    } catch (err) {
      console.error("Send request error:", err);
      res.status(500).json({ error: "Failed to submit send request" });
    }
  },
};
