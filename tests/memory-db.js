// In-memory stand-in for db.js, used by the API integration tests.
// Mirrors only the behaviour the controllers rely on.

import crypto from "crypto";

const state = {
  users: new Map(),
  accounts: new Map(),
  otps: [],
  devices: new Map(),
  sessions: [],
  transactions: new Map(),
  portfolio: [],
};

export const reset = () => {
  state.users.clear();
  state.accounts.clear();
  state.otps.length = 0;
  state.devices.clear();
  state.sessions.length = 0;
  state.transactions.clear();
  state.portfolio.length = 0;
};

export const store = state;

const now = () => new Date();
const clone = (value) => (value ? { ...value } : value);

export const dbUser = {
  async findByEmail(email) {
    const key = String(email).toLowerCase().trim();
    for (const user of state.users.values()) {
      if (user.email === key) return clone(user);
    }
    return null;
  },
  async findById(id) {
    return clone(state.users.get(id));
  },
  async create(email, passwordHash, name, isAdmin = false) {
    const user = {
      id: crypto.randomUUID(),
      email: String(email).toLowerCase().trim(),
      password_hash: passwordHash,
      name,
      phone: null,
      avatar_url: null,
      status: "active",
      registration_status: "confirmed",
      is_verified: false,
      is_admin: isAdmin,
      verification_token: null,
      created_at: now(),
      updated_at: now(),
    };
    state.users.set(user.id, user);
    return clone(user);
  },
  async updateCredentials(id, { passwordHash, name }) {
    const user = state.users.get(id);
    if (passwordHash) user.password_hash = passwordHash;
    if (name) user.name = name;
    user.updated_at = now();
    return clone(user);
  },
  async list(limit = 100, offset = 0) {
    return [...state.users.values()]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(offset, offset + limit)
      .map((user) => ({ ...user, account: clone(state.accounts.get(user.id)) }));
  },
  async count() {
    return state.users.size;
  },
  async updateProfile(id, data) {
    const user = state.users.get(id);
    if (data.name !== undefined) user.name = data.name;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.avatarUrl !== undefined) user.avatar_url = data.avatarUrl;
    user.updated_at = now();
    return clone(user);
  },
  async verify(id) {
    const user = state.users.get(id);
    user.is_verified = true;
    user.verification_token = null;
    return clone(user);
  },
  async setStatus(id, status) {
    const user = state.users.get(id);
    user.status = status;
    return clone(user);
  },
  async delete(id) {
    state.users.delete(id);
    state.accounts.delete(id);
  },
};

const newAccount = (userId, balance = 0) => ({
  id: crypto.randomUUID(),
  user_id: userId,
  balance,
  total_investment: 0,
  total_profit: 0,
  monthly_income: 0,
  active_trades: 0,
  account_number: null,
  account_type: "standard",
  kyc_status: "pending",
  created_at: now(),
  updated_at: now(),
});

export const dbUserAccount = {
  async create(userId, balance = 0) {
    const account = newAccount(userId, balance);
    state.accounts.set(userId, account);
    return clone(account);
  },
  async getByUserId(userId) {
    return clone(state.accounts.get(userId));
  },
  async ensure(userId) {
    if (!state.accounts.has(userId)) state.accounts.set(userId, newAccount(userId));
    return clone(state.accounts.get(userId));
  },
  async updateBalance(userId, balance) {
    await this.ensure(userId);
    const account = state.accounts.get(userId);
    account.balance = balance;
    account.updated_at = now();
    return clone(account);
  },
  async updateStats(userId, stats) {
    await this.ensure(userId);
    const account = state.accounts.get(userId);
    if (stats.balance !== undefined) account.balance = stats.balance;
    if (stats.totalInvestment !== undefined)
      account.total_investment = stats.totalInvestment;
    if (stats.totalProfit !== undefined) account.total_profit = stats.totalProfit;
    if (stats.monthlyIncome !== undefined)
      account.monthly_income = stats.monthlyIncome;
    if (stats.activeTrades !== undefined) account.active_trades = stats.activeTrades;
    if (stats.accountType !== undefined) account.account_type = stats.accountType;
    if (stats.kycStatus !== undefined) account.kyc_status = stats.kycStatus;
    account.updated_at = now();
    return clone(account);
  },
};

export const dbOtp = {
  async create(email, codeHash, expiresAt, purpose = "verify") {
    const row = {
      id: BigInt(state.otps.length + 1),
      email,
      code: `${purpose}:${codeHash}`,
      expires_at: expiresAt,
      verified: false,
      attempts: 0,
      created_at: now(),
    };
    state.otps.push(row);
    return row;
  },
  async findActive(email, purpose = "verify") {
    return (
      [...state.otps]
        .reverse()
        .find(
          (o) =>
            o.email === email &&
            !o.verified &&
            o.expires_at > new Date() &&
            o.code.startsWith(`${purpose}:`),
        ) || null
    );
  },
  async lastIssuedAt(email, purpose = "verify") {
    const last = [...state.otps]
      .reverse()
      .find((o) => o.email === email && o.code.startsWith(`${purpose}:`));
    return last?.created_at ?? null;
  },
  async incrementAttempts(id) {
    const row = state.otps.find((o) => o.id === id);
    row.attempts += 1;
    return row;
  },
  async consume(id) {
    const row = state.otps.find((o) => o.id === id);
    row.verified = true;
    return row;
  },
  async invalidateAll(email, purpose = "verify") {
    for (const row of state.otps) {
      if (row.email === email && row.code.startsWith(`${purpose}:`)) {
        row.verified = true;
      }
    }
  },
  async cleanup() {},
};

export const dbDevice = {
  async find(userId, deviceId) {
    return clone(state.devices.get(`${userId}:${deviceId}`));
  },
  async upsert(userId, data) {
    const key = `${userId}:${data.deviceId}`;
    const existing = state.devices.get(key);
    const device = {
      id: existing?.id || crypto.randomUUID(),
      user_id: userId,
      device_id: data.deviceId,
      device_name: data.deviceName,
      device_type: data.deviceType,
      browser: data.browser,
      os: data.os,
      ip_address: data.ipAddress,
      last_active: now(),
      is_active: true,
      created_at: existing?.created_at || now(),
      updated_at: now(),
    };
    state.devices.set(key, device);
    return clone(device);
  },
  async list(userId) {
    return [...state.devices.values()].filter(
      (d) => d.user_id === userId && d.is_active,
    );
  },
  async remove(userId, deviceId) {
    const device = state.devices.get(`${userId}:${deviceId}`);
    if (device) device.is_active = false;
    return { count: device ? 1 : 0 };
  },
};

export const dbSession = {
  async upsert(deviceId, userId, token, expiresAt) {
    const session = { deviceId, userId, token, expiresAt, is_active: true };
    state.sessions.push(session);
    return session;
  },
  async deactivateAll(userId) {
    for (const s of state.sessions) if (s.userId === userId) s.is_active = false;
  },
};

const withUser = (tx) => ({
  ...tx,
  user: (() => {
    const u = state.users.get(tx.user_id);
    return u ? { id: u.id, email: u.email, name: u.name } : null;
  })(),
});

export const dbTransaction = {
  async list(userId) {
    return [...state.transactions.values()]
      .filter((t) => t.user_id === userId)
      .sort((a, b) => b.created_at - a.created_at);
  },
  async listAll(limit = 200) {
    return [...state.transactions.values()]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .map(withUser);
  },
  async create(data) {
    const tx = {
      id: crypto.randomUUID(),
      user_id: data.userId,
      type: data.type,
      symbol: data.symbol ?? null,
      quantity: data.quantity ?? null,
      price: data.price ?? null,
      amount: data.amount,
      status: data.status || "completed",
      created_at: now(),
      updated_at: now(),
    };
    state.transactions.set(tx.id, tx);
    return { ...tx };
  },
  async findById(id) {
    const tx = state.transactions.get(id);
    return tx ? withUser(tx) : null;
  },
  async updateStatus(id, status) {
    const tx = state.transactions.get(id);
    tx.status = status;
    return { ...tx };
  },
  async settle(txId, { debit }) {
    const tx = state.transactions.get(txId);
    if (!tx || tx.status !== "pending") return null;
    tx.status = "completed";

    await dbUserAccount.ensure(tx.user_id);
    const account = state.accounts.get(tx.user_id);
    const amount = Number(tx.amount) || 0;

    if (debit && Number(account.balance || 0) < amount) {
      tx.status = "pending"; // roll back, mirroring the real DB transaction
      throw Object.assign(new Error("Insufficient balance"), {
        code: "INSUFFICIENT_FUNDS",
        balance: Number(account.balance || 0),
      });
    }

    account.balance = Number(account.balance || 0) + (debit ? -amount : amount);
    return { transaction: withUser(tx), account: clone(account) };
  },
  async reject(txId) {
    const tx = state.transactions.get(txId);
    if (!tx || tx.status !== "pending") return null;
    tx.status = "rejected";
    return withUser(tx);
  },
  async pendingDebitTotal(userId) {
    return [...state.transactions.values()]
      .filter(
        (t) =>
          t.user_id === userId &&
          t.status === "pending" &&
          ["withdrawal", "send"].includes(t.type),
      )
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  },
};

export const dbPortfolio = {
  async getByUserId(userId) {
    return state.portfolio.filter((p) => p.user_id === userId);
  },
  async upsert() {
    throw new Error("not needed in tests");
  },
};

export const query = async () => ({ rows: [] });
export const prisma = {
  user: {
    update: async ({ where, data }) => {
      Object.assign(state.users.get(where.id), data);
      return clone(state.users.get(where.id));
    },
    updateMany: async () => ({ count: 0 }),
  },
  $disconnect: async () => {},
};
export const SAFE_USER_SELECT = {};
export default prisma;
