import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

// Route Imports
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import portfolioRoutes from "./routes/portfolioRoutes.js";
import { ensureSingleAdmin } from "./services/AdminInitService.js";

// BigInt serialization patch for Prisma
BigInt.prototype.toJSON = function () {
  return this.toString();
};
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://stockfxinvestment-mocha.vercel.app",
"https://www.stockfxinvestment.org"
];
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(morgan("dev"));
app.use(cookieParser());
app.use(express.json());


app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/portfolio", portfolioRoutes);

// Health Check
app.get("/api/health", (req, res) =>
  res.json({ status: "OK", timestamp: new Date() }),
);

// Legacy & Shared Compatibility
app.use("/api", authRoutes); // /api/login, /api/register
app.use("/api", userRoutes); // /api/dashboard, /api/manage-devices

// Initialize Database & Start Server
ensureSingleAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`Modular backend running on http://localhost:${PORT}`);
  });
});
