# StockFX API

Express + Prisma (PostgreSQL) API for the StockFX investment app.

## Setup

```bash
npm install
cp .env.example .env      # then fill in the values
npm run migrate           # prisma migrate deploy
npm run dev               # http://localhost:3001
```

### Required environment variables

| Variable         | Notes                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string. The server refuses to start without it. |
| `JWT_SECRET`     | **Required in production.** `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `RESEND_API_KEY` | Resend key used to deliver the sign-up OTP. Without it codes are only logged (dev). |
| `EMAIL_FROM`     | Verified Resend sender, e.g. `StockFX <no-reply@yourdomain.com>`.      |
| `ADMIN_EMAIL`    | The single administrator account.                                      |
| `ADMIN_PASSWORD` | **Required in production.** Reconciled into the admin account on boot. |
| `CORS_ORIGIN`    | Comma-separated list of allowed browser origins.                       |

If `ADMIN_PASSWORD` is unset in development and no admin exists yet, a random
one-time password is generated and printed once at startup.

## Sign-up flow

1. `POST /api/auth/register` — creates an **unverified** account and emails a
   6-digit code through Resend. No session is issued.
2. `POST /api/auth/verify-otp` — confirms the code and marks the account verified.
3. `POST /api/auth/login` — succeeds only for verified, active accounts.
   An unverified account gets a fresh code and a `403 EMAIL_NOT_VERIFIED`.
4. `POST /api/auth/resend-otp` — new code, subject to a cooldown and rate limits.

Codes are generated with `crypto.randomInt`, stored only as a SHA-256 hash,
expire after `OTP_TTL_MINUTES`, allow `OTP_MAX_ATTEMPTS` guesses, and are
single-use.

## Admin

All `/api/admin/*` routes (except `login`) require a session whose **database
row** has `is_admin = true` — never a JWT claim or a cookie value.

`POST /api/admin/update-stats` updates any subset of:
`balance`, `total_investment`, `total_profit`, `monthly_income`,
`active_trades`, `account_type`, `kyc_status`. Fields that are absent are left
untouched, and the user is emailed a summary of what changed.

## Money movement

Deposits, withdrawals and transfers are created as `pending` and only change a
balance when an admin approves them. Approval is a single database transaction
that claims the row (`status = 'pending'` guard) before moving funds, so a
double click cannot credit twice. Withdrawals and transfers are checked against
the *available* balance — the balance minus everything already awaiting
approval.

## Tests

```bash
npm test
```

Runs the API end-to-end against an in-memory database and a captured mail
transport, so no database or network access is needed and no real email is sent.
