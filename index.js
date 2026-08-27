import config from "./config.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import portfolioRoutes from "./routes/portfolioRoutes.js";
import { ensureSingleAdmin } from "./services/AdminInitService.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { dbOtp } from "./db.js";

// Prisma returns BigInt ids for otp_codes; make them JSON-serialisable.
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = express();

// Render/Vercel/nginx sit in front of the app - trust the first proxy hop so
// req.ip and secure cookies behave correctly.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  helmet({
    // API only - no HTML is served from here.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(morgan(config.isProd ? "combined" : "dev"));
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/server-to-server calls (no Origin header).
      if (!origin || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

// Blanket limiter; the auth routes add their own tighter limits on top.
app.use(
  rateLimit({
    name: "global",
    windowMs: 60 * 1000,
    max: 300,
  }),
);

app.get("/api/health", (req, res) =>
  res.json({ status: "OK", timestamp: new Date().toISOString() }),
);

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/portfolio", portfolioRoutes);

// Legacy flat paths (/api/login, /api/register, /api/dashboard, ...).
app.use("/api", authRoutes);
app.use("/api", userRoutes);

app.use(notFound);
app.use(errorHandler);

const start = async () => {
  await ensureSingleAdmin();

  // Purge expired/consumed OTP rows hourly.
  const cleanup = setInterval(
    () => dbOtp.cleanup().catch((err) => console.error("[OTP] cleanup failed:", err)),
    60 * 60 * 1000,
  );
  cleanup.unref?.();
  dbOtp.cleanup().catch(() => {});

  app.listen(config.port, () => {
    console.log(
      `[SERVER] Listening on http://localhost:${config.port} (${config.isProd ? "production" : "development"})`,
    );
  });
};

start().catch((err) => {
  console.error("[SERVER] Failed to start:", err);
  process.exit(1);
});

export default app;
