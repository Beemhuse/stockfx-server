import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import config from "./config.js";

if (!config.databaseUrl) {
  throw new Error("[DB] DATABASE_URL is not set. Refusing to start.");
}

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const query = (text, params) => pool.query(text, params);

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatar_url: true,
  status: true,
  registration_status: true,
  is_verified: true,
  is_admin: true,
  created_at: true,
  updated_at: true,
};

export const dbUser = {
  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  },
  async findById(id) {
    return prisma.user.findUnique({ where: { id } });
  },
  async create(email, passwordHash, name, isAdmin = false) {
    return prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        name,
        is_admin: isAdmin,
      },
    });
  },
  async updateCredentials(id, { passwordHash, name }) {
    const data = { updated_at: new Date() };
    if (passwordHash) data.password_hash = passwordHash;
    if (name) data.name = name;
    return prisma.user.update({ where: { id }, data });
  },
  async list(limit = 100, offset = 0) {
    return prisma.user.findMany({
      take: limit,
      skip: offset,
      orderBy: { created_at: "desc" },
      select: { ...SAFE_USER_SELECT, account: true },
    });
  },
  async count() {
    return prisma.user.count();
  },
  async updateProfile(id, data) {
    const patch = { updated_at: new Date() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.avatarUrl !== undefined) patch.avatar_url = data.avatarUrl;
    return prisma.user.update({ where: { id }, data: patch });
  },
  async verify(id) {
    return prisma.user.update({
      where: { id },
      data: {
        is_verified: true,
        verification_token: null,
        registration_status: "confirmed",
        updated_at: new Date(),
      },
    });
  },
  async setStatus(id, status) {
    return prisma.user.update({
      where: { id },
      data: { status, updated_at: new Date() },
    });
  },
  async delete(id) {
    return prisma.user.delete({ where: { id } });
  },
};

export const dbUserAccount = {
  async create(userId, balance = 0) {
    return prisma.userAccount.create({ data: { user_id: userId, balance } });
  },
  async getByUserId(userId) {
    return prisma.userAccount.findUnique({ where: { user_id: userId } });
  },
  // Accounts are created at registration, but never assume one exists.
  async ensure(userId) {
    return prisma.userAccount.upsert({
      where: { user_id: userId },
      update: {},
      create: { user_id: userId, balance: 0 },
    });
  },
  async updateBalance(userId, balance) {
    return prisma.userAccount.upsert({
      where: { user_id: userId },
      update: { balance, updated_at: new Date() },
      create: { user_id: userId, balance },
    });
  },
  async updateStats(userId, stats) {
    const data = { updated_at: new Date() };
    if (stats.balance !== undefined) data.balance = stats.balance;
    if (stats.totalInvestment !== undefined)
      data.total_investment = stats.totalInvestment;
    if (stats.totalProfit !== undefined) data.total_profit = stats.totalProfit;
    if (stats.monthlyIncome !== undefined)
      data.monthly_income = stats.monthlyIncome;
    if (stats.activeTrades !== undefined) data.active_trades = stats.activeTrades;
    if (stats.accountType !== undefined) data.account_type = stats.accountType;
    if (stats.kycStatus !== undefined) data.kyc_status = stats.kycStatus;

    return prisma.userAccount.upsert({
      where: { user_id: userId },
      update: data,
      create: { user_id: userId, balance: stats.balance ?? 0, ...data },
    });
  },
};

// OTP rows store `purpose:sha256(code)` in the `code` column - the raw code is
// never persisted, so a database leak cannot be replayed against the API.
export const dbOtp = {
  async create(email, codeHash, expiresAt, purpose = "verify") {
    return prisma.otpCode.create({
      data: { email, code: `${purpose}:${codeHash}`, expires_at: expiresAt },
    });
  },
  async findActive(email, purpose = "verify") {
    return prisma.otpCode.findFirst({
      where: {
        email,
        verified: false,
        expires_at: { gt: new Date() },
        code: { startsWith: `${purpose}:` },
      },
      orderBy: { created_at: "desc" },
    });
  },
  async lastIssuedAt(email, purpose = "verify") {
    const last = await prisma.otpCode.findFirst({
      where: { email, code: { startsWith: `${purpose}:` } },
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    });
    return last?.created_at ?? null;
  },
  async incrementAttempts(id) {
    return prisma.otpCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  },
  async consume(id) {
    return prisma.otpCode.update({ where: { id }, data: { verified: true } });
  },
  async invalidateAll(email, purpose = "verify") {
    return prisma.otpCode.updateMany({
      where: { email, verified: false, code: { startsWith: `${purpose}:` } },
      data: { verified: true },
    });
  },
  async cleanup() {
    return prisma.otpCode.deleteMany({
      where: {
        OR: [
          { expires_at: { lt: new Date() } },
          {
            verified: true,
            created_at: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        ],
      },
    });
  },
};

export const dbDevice = {
  async find(userId, deviceId) {
    return prisma.device.findUnique({
      where: { user_id_device_id: { user_id: userId, device_id: deviceId } },
    });
  },
  async upsert(userId, data) {
    const { deviceId, deviceName, deviceType, browser, os, ipAddress } = data;
    return prisma.device.upsert({
      where: { user_id_device_id: { user_id: userId, device_id: deviceId } },
      update: {
        device_name: deviceName,
        device_type: deviceType,
        browser,
        os,
        ip_address: ipAddress,
        last_active: new Date(),
        is_active: true,
        updated_at: new Date(),
      },
      create: {
        user_id: userId,
        device_id: deviceId,
        device_name: deviceName,
        device_type: deviceType,
        browser,
        os,
        ip_address: ipAddress,
      },
    });
  },
  async list(userId) {
    return prisma.device.findMany({
      where: { user_id: userId, is_active: true },
      orderBy: { last_active: "desc" },
    });
  },
  async remove(userId, deviceId) {
    // updateMany so an unknown device id is a no-op instead of a 500.
    return prisma.device.updateMany({
      where: { user_id: userId, device_id: deviceId },
      data: { is_active: false, updated_at: new Date() },
    });
  },
};

export const dbSession = {
  async upsert(deviceId, userId, token, expiresAt) {
    const session = await prisma.deviceSession.findFirst({
      where: { device_id: deviceId, user_id: userId, is_active: true },
    });

    if (session) {
      return prisma.deviceSession.update({
        where: { id: session.id },
        data: { token, expires_at: expiresAt, updated_at: new Date() },
      });
    }
    return prisma.deviceSession.create({
      data: {
        device_id: deviceId,
        user_id: userId,
        token,
        expires_at: expiresAt,
      },
    });
  },
  async deactivateAll(userId) {
    return prisma.deviceSession.updateMany({
      where: { user_id: userId, is_active: true },
      data: { is_active: false, updated_at: new Date() },
    });
  },
};

export const dbTransaction = {
  async list(userId) {
    return prisma.transaction.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: 200,
    });
  },
  async listAll(limit = 200) {
    return prisma.transaction.findMany({
      orderBy: { created_at: "desc" },
      take: limit,
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  },
  async create(data) {
    return prisma.transaction.create({
      data: {
        user_id: data.userId,
        type: data.type,
        symbol: data.symbol,
        quantity: data.quantity,
        price: data.price,
        amount: data.amount,
        status: data.status || "completed",
      },
    });
  },
  async findById(id) {
    return prisma.transaction.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  },
  async updateStatus(id, status) {
    return prisma.transaction.update({
      where: { id },
      data: { status, updated_at: new Date() },
    });
  },

  // Approve a pending transaction and move the money in one DB transaction.
  // Returns null when the row was already processed by a concurrent request.
  async settle(txId, { debit }) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.transaction.updateMany({
        where: { id: txId, status: "pending" },
        data: { status: "completed", updated_at: new Date() },
      });
      if (claimed.count === 0) return null;

      const record = await tx.transaction.findUnique({
        where: { id: txId },
        include: { user: { select: { id: true, email: true, name: true } } },
      });

      const amount = Number(record.amount) || 0;
      const account = await tx.userAccount.upsert({
        where: { user_id: record.user_id },
        update: {},
        create: { user_id: record.user_id, balance: 0 },
      });

      if (debit && Number(account.balance || 0) < amount) {
        throw Object.assign(new Error("Insufficient balance"), {
          code: "INSUFFICIENT_FUNDS",
          balance: Number(account.balance || 0),
        });
      }

      const updatedAccount = await tx.userAccount.update({
        where: { user_id: record.user_id },
        data: {
          balance: { increment: debit ? -amount : amount },
          updated_at: new Date(),
        },
      });

      return { transaction: record, account: updatedAccount };
    });
  },

  async reject(txId) {
    const claimed = await prisma.transaction.updateMany({
      where: { id: txId, status: "pending" },
      data: { status: "rejected", updated_at: new Date() },
    });
    if (claimed.count === 0) return null;
    return this.findById(txId);
  },

  // Total of the user's pending debits - stops a balance being committed twice.
  async pendingDebitTotal(userId) {
    const result = await prisma.transaction.aggregate({
      where: {
        user_id: userId,
        status: "pending",
        type: { in: ["withdrawal", "send"] },
      },
      _sum: { amount: true },
    });
    return Number(result._sum.amount || 0);
  },
};

export const dbPortfolio = {
  async getByUserId(userId) {
    return prisma.portfolio.findMany({ where: { user_id: userId } });
  },
  async upsert(userId, symbol, quantity, averageCost) {
    return prisma.portfolio.upsert({
      where: { user_id_symbol: { user_id: userId, symbol } },
      update: { quantity, average_cost: averageCost, updated_at: new Date() },
      create: { user_id: userId, symbol, quantity, average_cost: averageCost },
    });
  },
};

export { prisma, SAFE_USER_SELECT };
export default prisma;
