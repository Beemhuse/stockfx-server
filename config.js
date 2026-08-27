import "dotenv/config";

const isProd = process.env.NODE_ENV === "production";

function requiredInProd(name, fallback) {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (isProd) {
    throw new Error(
      `[CONFIG] ${name} must be set in production. Refusing to start with an insecure default.`,
    );
  }
  console.warn(`[CONFIG] ${name} is not set - using an insecure development default.`);
  return fallback;
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 3001,

  jwtSecret: requiredInProd("JWT_SECRET", "dev-only-insecure-secret"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  databaseUrl: process.env.DATABASE_URL,

  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "StockFX <no-reply@karteq.com.ng>",

  admin: {
    email: (process.env.ADMIN_EMAIL || "officialstockfxinvestment@gmail.com")
      .toLowerCase()
      .trim(),
    // Never fall back to a well-known password. When unset in development the
    // existing admin password is left untouched (see AdminInitService).
    password: (process.env.ADMIN_PASSWORD || "").trim() || null,
    name: process.env.ADMIN_NAME || "System Administrator",
  },

  otp: {
    length: 6,
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES) || 10,
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN) || 60,
  },

  corsOrigins: (
    process.env.CORS_ORIGIN ||
    [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://stockfxinvestment-mocha.vercel.app",
      "https://www.stockfxinvestment.org",
      "https://stockfxinvestment.org",
    ].join(",")
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};

// Frontend and API are served from different sites in production, so the session
// cookie has to be a cross-site cookie (SameSite=None requires Secure).
export const cookieOptions = (overrides = {}) => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: config.isProd ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  ...overrides,
});

export default config;
