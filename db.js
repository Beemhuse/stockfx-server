import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const query = (text, params) => pool.query(text, params);

export const dbUser = {
  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  },
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
    });
  },
  async create(email, passwordHash, name, isAdmin = false) {
    console.log(`[DB] Creating user: ${email} (Admin: ${isAdmin})`);
    return prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        name,
        is_admin: isAdmin,
      },
    });
  },
  async list(limit = 100, offset = 0) {
    return prisma.user.findMany({
      take: limit,
      skip: offset,
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        is_admin: true,
        created_at: true,
      },
    });
  },
  async updateProfile(id, data) {
    return prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone,
        avatar_url: data.avatarUrl,
        updated_at: new Date(),
      },
    });
  },
  async setVerificationToken(id, token) {
    return prisma.user.update({
      where: { id },
      data: { verification_token: token },
    });
  },
  async verify(id) {
    return prisma.user.update({
      where: { id },
      data: { is_verified: true, verification_token: null },
    });
  },
  async findByVerificationToken(token) {
    return prisma.user.findUnique({
      where: { verification_token: token },
    });
  },
  async delete(id) {
    return prisma.user.delete({
      where: { id },
    });
  },
};

export const dbUserAccount = {
  async create(userId, balance = 0) {
    return prisma.userAccount.create({
      data: {
        user_id: userId,
        balance,
      },
    });
  },
  async getByUserId(userId) {
    return prisma.userAccount.findUnique({
      where: { user_id: userId },
    });
  },
  async updateBalance(userId, balance) {
    return prisma.userAccount.update({
      where: { user_id: userId },
      data: { balance, updated_at: new Date() },
    });
  },
  async incrementBalance(userId, amount) {
    return prisma.userAccount.update({
      where: { user_id: userId },
      data: {
        balance: { increment: amount },
        updated_at: new Date(),
      },
    });
  },
};

export const dbOtp = {
  async create(email, code, expiresAt) {
    return prisma.otpCode.create({
      data: {
        email,
        code,
        expires_at: expiresAt,
      },
    });
  },
  async verify(email, code) {
    // Prisma doesn't have a direct 'update first that matches' but we can do it in two steps or use updateMany
    const otp = await prisma.otpCode.findFirst({
      where: {
        email,
        code,
        verified: false,
        expires_at: { gt: new Date() },
      },
    });

    if (!otp) {
      console.log(`[DB] OTP not found or expired for ${email}`);
      return null;
    }

    console.log(`[DB] OTP found, marking as verified: ${otp.id}`);
    return prisma.otpCode.update({
      where: { id: otp.id },
      data: { verified: true },
    });
  },
  async cleanup() {
    return prisma.otpCode.deleteMany({
      where: {
        OR: [{ expires_at: { lt: new Date() } }, { verified: true }],
      },
    });
  },
};

export const dbDevice = {
  async find(userId, deviceId) {
    return prisma.device.findUnique({
      where: {
        user_id_device_id: {
          user_id: userId,
          device_id: deviceId,
        },
      },
    });
  },
  async upsert(userId, data) {
    const { deviceId, deviceName, deviceType, browser, os, ipAddress } = data;
    return prisma.device.upsert({
      where: {
        user_id_device_id: {
          user_id: userId,
          device_id: deviceId,
        },
      },
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
    });
  },
  async remove(userId, deviceId) {
    return prisma.device.update({
      where: {
        user_id_device_id: {
          user_id: userId,
          device_id: deviceId,
        },
      },
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
    } else {
      return prisma.deviceSession.create({
        data: {
          device_id: deviceId,
          user_id: userId,
          token,
          expires_at: expiresAt,
        },
      });
    }
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
    });
  },
  async listAll() {
    return prisma.transaction.findMany({
      orderBy: { created_at: "desc" },
      include: { user: { select: { email: true, name: true } } },
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
      include: { user: { select: { email: true, name: true } } },
    });
  },
  async updateStatus(id, status) {
    return prisma.transaction.update({
      where: { id },
      data: { status, updated_at: new Date() },
    });
  },
};

export const dbPortfolio = {
  async getByUserId(userId) {
    return prisma.portfolio.findMany({
      where: { user_id: userId },
    });
  },
  async upsert(userId, symbol, quantity, averageCost) {
    return prisma.portfolio.upsert({
      where: {
        user_id_symbol: {
          user_id: userId,
          symbol,
        },
      },
      update: {
        quantity,
        average_cost: averageCost,
        updated_at: new Date(),
      },
      create: {
        user_id: userId,
        symbol,
        quantity,
        average_cost: averageCost,
      },
    });
  },
};

// Add stats update to dbUserAccount
dbUserAccount.updateStats = async (userId, stats) => {
  return prisma.userAccount.update({
    where: { user_id: userId },
    data: {
      total_investment: stats.totalInvestment,
      account_type: stats.accountType,
      updated_at: new Date(),
    },
  });
};

export { prisma };
export default prisma;
