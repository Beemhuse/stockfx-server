import { dbTransaction, dbUserAccount } from "../db.js";
import {
  HttpError,
  formatMoney,
  requireEmail,
  requirePositiveAmount,
} from "../utils/validate.js";

const MAX_PENDING_REQUESTS = 10;

const assertVerified = (user) => {
  if (!user.is_verified) {
    throw new HttpError(
      403,
      "Please verify your email address before moving funds.",
      "EMAIL_NOT_VERIFIED",
    );
  }
};

/**
 * Debits are only applied on approval, so the *available* balance must account
 * for everything already awaiting approval - otherwise a user can queue ten
 * withdrawals against one balance.
 */
const assertSufficientFunds = async (userId, amount) => {
  const account = await dbUserAccount.ensure(userId);
  const pending = await dbTransaction.pendingDebitTotal(userId);
  const available = Number(account.balance ?? 0) - pending;

  if (amount > available) {
    throw new HttpError(
      400,
      `Insufficient available balance. You have $${formatMoney(available)} available` +
        (pending > 0 ? ` ($${formatMoney(pending)} awaiting approval).` : "."),
      "INSUFFICIENT_FUNDS",
    );
  }
};

const assertRequestQuota = async (userId) => {
  const pending = await dbTransaction.list(userId);
  const open = pending.filter((t) => t.status === "pending").length;
  if (open >= MAX_PENDING_REQUESTS) {
    throw new HttpError(
      429,
      "You already have too many requests awaiting approval.",
      "TOO_MANY_PENDING",
    );
  }
};

export const TransactionController = {
  async requestDeposit(req, res, next) {
    try {
      assertVerified(req.user);
      const amount = requirePositiveAmount(req.body?.amount);
      await assertRequestQuota(req.user.id);

      const transaction = await dbTransaction.create({
        userId: req.user.id,
        type: "deposit",
        amount,
        status: "pending",
      });

      res.status(201).json({
        success: true,
        transaction,
        message: "Deposit request submitted for approval",
      });
    } catch (err) {
      next(err);
    }
  },

  async requestWithdrawal(req, res, next) {
    try {
      assertVerified(req.user);
      const amount = requirePositiveAmount(req.body?.amount);
      await assertRequestQuota(req.user.id);
      await assertSufficientFunds(req.user.id, amount);

      const transaction = await dbTransaction.create({
        userId: req.user.id,
        type: "withdrawal",
        amount,
        status: "pending",
      });

      res.status(201).json({
        success: true,
        transaction,
        message: "Withdrawal request submitted for approval",
      });
    } catch (err) {
      next(err);
    }
  },

  async requestSend(req, res, next) {
    try {
      assertVerified(req.user);
      const amount = requirePositiveAmount(req.body?.amount);
      const recipient = requireEmail(req.body?.recipient, "recipient email");

      if (recipient === req.user.email) {
        throw new HttpError(
          400,
          "You cannot send funds to your own account.",
          "INVALID_RECIPIENT",
        );
      }

      await assertRequestQuota(req.user.id);
      await assertSufficientFunds(req.user.id, amount);

      const transaction = await dbTransaction.create({
        userId: req.user.id,
        type: "send",
        amount,
        // `symbol` doubles as the recipient reference for transfers.
        symbol: recipient,
        status: "pending",
      });

      res.status(201).json({
        success: true,
        transaction,
        message: "Transfer request submitted for approval",
      });
    } catch (err) {
      next(err);
    }
  },
};

export default TransactionController;
