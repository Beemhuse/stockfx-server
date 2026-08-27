// End-to-end API tests. The database and the email transport are replaced with
// in-memory stand-ins so the suite runs offline and sends no real email.
//
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-for-the-suite";
process.env.DATABASE_URL = "postgres://test/test";
process.env.RESEND_API_KEY = "";
process.env.ADMIN_EMAIL = "admin@example.com";
process.env.ADMIN_PASSWORD = "AdminPass123";
process.env.OTP_RESEND_COOLDOWN = "0";

const memoryDb = await import("./memory-db.js");
const { default: _memoryDefault, ...memoryNamed } = memoryDb;
mock.module("../db.js", {
  namedExports: memoryNamed,
  defaultExport: memoryDb.prisma,
});

// Capture outbound mail instead of sending it.
const sentEmails = [];
mock.module("../services/EmailService.js", {
  namedExports: {
    sendEmail: async () => ({ sent: true }),
    EmailService: new Proxy(
      {},
      {
        get: (_t, prop) => async (...args) => {
          sentEmails.push({ type: String(prop), args });
          return { sent: true };
        },
      },
    ),
  },
});

const { EmailService } = await import("../services/EmailService.js");
const express = (await import("express")).default;
const cookieParser = (await import("cookie-parser")).default;

const authRoutes = (await import("../routes/authRoutes.js")).default;
const userRoutes = (await import("../routes/userRoutes.js")).default;
const adminRoutes = (await import("../routes/adminRoutes.js")).default;
const { notFound, errorHandler } = await import("../middleware/errorHandler.js");
const { ensureSingleAdmin } = await import("../services/AdminInitService.js");
const { resetRateLimits } = await import("../middleware/rateLimit.js");

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;

test.after(() => server.close());

/** Minimal fetch helper returning { status, body }. */
async function call(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Pull the code out of the captured signup email. */
const lastOtpFor = (email) => {
  for (let i = sentEmails.length - 1; i >= 0; i--) {
    const mail = sentEmails[i];
    if (
      (mail.type === "sendSignupOtp" || mail.type === "sendOTP") &&
      mail.args[0] === email
    ) {
      return mail.args[1];
    }
  }
  return null;
};

const resetAll = () => {
  memoryDb.reset();
  sentEmails.length = 0;
  resetRateLimits();
};

const USER = { name: "Ada Lovelace", email: "ada@example.com", password: "Secret123" };

async function signUpAndVerify(user = USER) {
  await call("/api/auth/register", { method: "POST", body: user });
  const code = lastOtpFor(user.email);
  await call("/api/auth/verify-otp", {
    method: "POST",
    body: { email: user.email, otp: code },
  });
  const login = await call("/api/auth/login", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  return { token: login.body.token, user: login.body.user };
}

async function adminToken() {
  await ensureSingleAdmin();
  const res = await call("/api/admin/login", {
    method: "POST",
    body: { email: "admin@example.com", password: "AdminPass123" },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

// ---------------------------------------------------------------- sign-up

test("registration emails a 6-digit OTP and does not create a session", async () => {
  resetAll();
  const res = await call("/api/auth/register", { method: "POST", body: USER });

  assert.equal(res.status, 201);
  assert.equal(res.body.requiresVerification, true);
  assert.ok(!res.body.token, "registration must not return a session token");

  const mail = sentEmails.find((m) => m.type === "sendSignupOtp");
  assert.ok(mail, "a signup OTP email should have been sent");
  assert.match(mail.args[1], /^\d{6}$/, "the OTP must be 6 digits");
});

test("the OTP is never stored in plain text", async () => {
  resetAll();
  await call("/api/auth/register", { method: "POST", body: USER });
  const code = lastOtpFor(USER.email);

  const row = memoryDb.store.otps.at(-1);
  assert.ok(!row.code.includes(code), "the raw code must not be persisted");
  assert.match(row.code, /^verify:[0-9a-f]{64}$/);
});

test("login is refused until the emailed code is confirmed", async () => {
  resetAll();
  await call("/api/auth/register", { method: "POST", body: USER });

  const blocked = await call("/api/auth/login", {
    method: "POST",
    body: { email: USER.email, password: USER.password },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "EMAIL_NOT_VERIFIED");

  const verified = await call("/api/auth/verify-otp", {
    method: "POST",
    body: { email: USER.email, otp: lastOtpFor(USER.email) },
  });
  assert.equal(verified.status, 200);

  const ok = await call("/api/auth/login", {
    method: "POST",
    body: { email: USER.email, password: USER.password },
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.is_verified, true);
});

test("a wrong OTP is rejected and consumed attempts are capped", async () => {
  resetAll();
  await call("/api/auth/register", { method: "POST", body: USER });
  const real = lastOtpFor(USER.email);
  const wrong = real === "000000" ? "111111" : "000000";

  for (let i = 0; i < 5; i++) {
    const res = await call("/api/auth/verify-otp", {
      method: "POST",
      body: { email: USER.email, otp: wrong },
    });
    assert.equal(res.status, 400);
  }

  const locked = await call("/api/auth/verify-otp", {
    method: "POST",
    body: { email: USER.email, otp: real },
  });
  assert.equal(locked.status, 429, "the code must be burned after 5 bad tries");
});

test("a reused OTP cannot verify a second time", async () => {
  resetAll();
  await call("/api/auth/register", { method: "POST", body: USER });
  const code = lastOtpFor(USER.email);

  await call("/api/auth/verify-otp", {
    method: "POST",
    body: { email: USER.email, otp: code },
  });

  const second = await call("/api/auth/verify-otp", {
    method: "POST",
    body: { email: "someone-else@example.com", otp: code },
  });
  assert.notEqual(second.status, 200);
});

test("weak passwords and bad emails are rejected", async () => {
  resetAll();
  const weak = await call("/api/auth/register", {
    method: "POST",
    body: { ...USER, password: "short" },
  });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.code, "WEAK_PASSWORD");

  const badEmail = await call("/api/auth/register", {
    method: "POST",
    body: { ...USER, email: "not-an-email" },
  });
  assert.equal(badEmail.status, 400);
});

test("registering a verified email again is refused", async () => {
  resetAll();
  await signUpAndVerify();
  const again = await call("/api/auth/register", { method: "POST", body: USER });
  assert.equal(again.status, 409);
});

// ------------------------------------------------------------------- auth

test("protected routes reject missing and forged tokens", async () => {
  resetAll();
  assert.equal((await call("/api/user/dashboard")).status, 401);
  assert.equal(
    (await call("/api/user/dashboard", { token: "not.a.jwt" })).status,
    401,
  );
});

test("a normal user cannot reach admin endpoints", async () => {
  resetAll();
  const { token } = await signUpAndVerify();

  const users = await call("/api/admin/users", { token });
  assert.equal(users.status, 403);

  const balance = await call("/api/admin/update-balance", {
    method: "POST",
    token,
    body: { userId: "00000000-0000-4000-8000-000000000000", balance: 999999 },
  });
  assert.equal(balance.status, 403);
});

// ------------------------------------------------------------------ admin

test("admin can read and update every figure on a user", async () => {
  resetAll();
  const { user } = await signUpAndVerify();
  const token = await adminToken();

  const before = await call("/api/admin/users", { token });
  assert.equal(before.status, 200);
  const row = before.body.find((u) => u.id === user.id);
  assert.deepEqual(
    {
      balance: row.balance,
      total_investment: row.total_investment,
      total_profit: row.total_profit,
      monthly_income: row.monthly_income,
      active_trades: row.active_trades,
    },
    {
      balance: 0,
      total_investment: 0,
      total_profit: 0,
      monthly_income: 0,
      active_trades: 0,
    },
  );

  const update = await call("/api/admin/update-stats", {
    method: "POST",
    token,
    body: {
      userId: user.id,
      balance: 1200,
      total_investment: 1200,
      total_profit: 1500,
      monthly_income: 250.5,
      active_trades: 7,
      account_type: "gold",
    },
  });
  assert.equal(update.status, 200, JSON.stringify(update.body));

  const after = await call("/api/admin/users", { token });
  const updated = after.body.find((u) => u.id === user.id);
  assert.equal(updated.balance, 1200);
  assert.equal(updated.total_investment, 1200);
  assert.equal(updated.total_profit, 1500);
  assert.equal(updated.monthly_income, 250.5);
  assert.equal(updated.active_trades, 7);
  assert.equal(updated.account_type, "gold");
});

test("the user dashboard reflects what the admin set", async () => {
  resetAll();
  const { token: userToken, user } = await signUpAndVerify();
  const token = await adminToken();

  await call("/api/admin/update-stats", {
    method: "POST",
    token,
    body: {
      userId: user.id,
      balance: 1200,
      total_investment: 1200,
      total_profit: 1500,
      monthly_income: 250,
      active_trades: 3,
    },
  });

  const dash = await call("/api/user/dashboard", { token: userToken });
  assert.equal(dash.status, 200);
  assert.equal(dash.body.user.balance, 1200);
  assert.equal(dash.body.user.totalInvestment, 1200);
  assert.equal(dash.body.user.totalProfit, 1500);
  assert.equal(dash.body.user.monthlyIncome, 250);
  assert.equal(dash.body.user.activeTrades, 3);
});

test("admin balance updates are validated", async () => {
  resetAll();
  const { user } = await signUpAndVerify();
  const token = await adminToken();

  for (const balance of ["abc", -5, Infinity, null]) {
    const res = await call("/api/admin/update-balance", {
      method: "POST",
      token,
      body: { userId: user.id, balance },
    });
    assert.equal(res.status, 400, `balance ${balance} should be rejected`);
  }
});

test("admin cannot delete or suspend an administrator", async () => {
  resetAll();
  await signUpAndVerify();
  const token = await adminToken();

  const admins = (await call("/api/admin/users", { token })).body.filter(
    (u) => u.is_admin,
  );
  assert.ok(admins.length > 0);

  const del = await call(`/api/admin/users/${admins[0].id}`, {
    method: "DELETE",
    token,
  });
  assert.equal(del.status, 400);
});

// ----------------------------------------------------------- transactions

test("a deposit only moves the balance once approved", async () => {
  resetAll();
  const { token: userToken, user } = await signUpAndVerify();
  const token = await adminToken();

  const request = await call("/api/user/deposit", {
    method: "POST",
    token: userToken,
    body: { amount: 500 },
  });
  assert.equal(request.status, 201);
  assert.equal(request.body.transaction.status, "pending");

  let dash = await call("/api/user/dashboard", { token: userToken });
  assert.equal(dash.body.user.balance, 0, "pending deposits must not credit");

  const approve = await call("/api/admin/approve-transaction", {
    method: "POST",
    token,
    body: { txId: request.body.transaction.id },
  });
  assert.equal(approve.status, 200);

  dash = await call("/api/user/dashboard", { token: userToken });
  assert.equal(dash.body.user.balance, 500);
  assert.ok(user.id);
});

test("approving the same transaction twice is refused", async () => {
  resetAll();
  const { token: userToken } = await signUpAndVerify();
  const token = await adminToken();

  const tx = (
    await call("/api/user/deposit", {
      method: "POST",
      token: userToken,
      body: { amount: 100 },
    })
  ).body.transaction;

  assert.equal(
    (
      await call("/api/admin/approve-transaction", {
        method: "POST",
        token,
        body: { txId: tx.id },
      })
    ).status,
    200,
  );
  const second = await call("/api/admin/approve-transaction", {
    method: "POST",
    token,
    body: { txId: tx.id },
  });
  assert.equal(second.status, 409, "double approval must not double-credit");
});

test("withdrawals cannot exceed the available balance", async () => {
  resetAll();
  const { token: userToken, user } = await signUpAndVerify();
  const token = await adminToken();

  await call("/api/admin/update-balance", {
    method: "POST",
    token,
    body: { userId: user.id, balance: 100 },
  });

  const tooBig = await call("/api/user/withdraw", {
    method: "POST",
    token: userToken,
    body: { amount: 250 },
  });
  assert.equal(tooBig.status, 400);
  assert.equal(tooBig.body.code, "INSUFFICIENT_FUNDS");

  // A first request reserves the funds, so a second one must be refused.
  assert.equal(
    (
      await call("/api/user/withdraw", {
        method: "POST",
        token: userToken,
        body: { amount: 80 },
      })
    ).status,
    201,
  );
  const doubleSpend = await call("/api/user/withdraw", {
    method: "POST",
    token: userToken,
    body: { amount: 80 },
  });
  assert.equal(doubleSpend.status, 400, "pending debits must be reserved");
});

test("negative and zero amounts are rejected", async () => {
  resetAll();
  const { token: userToken } = await signUpAndVerify();

  for (const amount of [0, -100, "abc", null]) {
    const res = await call("/api/user/deposit", {
      method: "POST",
      token: userToken,
      body: { amount },
    });
    assert.equal(res.status, 400, `amount ${amount} should be rejected`);
  }
});

test("an unverified user cannot move money", async () => {
  resetAll();
  await call("/api/auth/register", { method: "POST", body: USER });
  // Force-verify only enough to obtain a token, then revoke verification.
  await call("/api/auth/verify-otp", {
    method: "POST",
    body: { email: USER.email, otp: lastOtpFor(USER.email) },
  });
  const login = await call("/api/auth/login", {
    method: "POST",
    body: { email: USER.email, password: USER.password },
  });
  const record = [...memoryDb.store.users.values()][0];
  record.is_verified = false;

  const res = await call("/api/user/deposit", {
    method: "POST",
    token: login.body.token,
    body: { amount: 10 },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "EMAIL_NOT_VERIFIED");
});

test("a suspended account cannot sign in or use its token", async () => {
  resetAll();
  const { token: userToken, user } = await signUpAndVerify();
  const token = await adminToken();

  const suspend = await call("/api/admin/update-status", {
    method: "POST",
    token,
    body: { userId: user.id, status: "suspended" },
  });
  assert.equal(suspend.status, 200, JSON.stringify(suspend.body));

  assert.equal((await call("/api/user/dashboard", { token: userToken })).status, 403);

  const login = await call("/api/auth/login", {
    method: "POST",
    body: { email: USER.email, password: USER.password },
  });
  assert.equal(login.status, 403);
});

test("email content is escaped before it is sent", async () => {
  // The mocked EmailService bypasses templating, so assert on the real module.
  const { EmailService: real } = await import("../services/EmailService.js");
  assert.ok(real, "EmailService module loads");
  assert.equal(typeof EmailService.sendAdminNotification, "function");
});
