import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { dbUser, dbUserAccount, dbOtp, dbDevice, dbSession } from "../db.js";
import { EmailService } from "../services/EmailService.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

export const AuthController = {
  async sendOTP(req, res) {
    const { email, otp, isRegistration } = req.body;
    if (!email || !otp)
      return res.status(400).json({ error: "Email and OTP required" });

    try {
      if (isRegistration) {
        const existing = await dbUser.findByEmail(email);
        if (existing)
          return res.status(409).json({ error: "Email already registered" });
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await dbOtp.create(email, otp, expiresAt);
      await EmailService.sendOTP(email, otp);

      res.json({ success: true, message: "OTP sent" });
    } catch (err) {
      res.status(500).json({ error: "Failed to send OTP" });
    }
  },

  async verifyOTP(req, res) {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ error: "Email and OTP required" });

    try {
      const verified = await dbOtp.verify(email, otp);
      if (!verified)
        return res.status(401).json({ error: "Invalid or expired OTP" });

      res.json({ success: true, message: "Code verified successfully" });
    } catch (err) {
      console.error("Verification error:", err);
      res.status(500).json({ error: "Verification failed" });
    }
  },

  async register(req, res) {
    const { name, email, password } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ error: "Missing fields" });

    try {
      const existing = await dbUser.findByEmail(email);
      if (existing)
        return res.status(409).json({ error: "Email already exists" });

      const hash = await bcrypt.hash(password, 10);
      const user = await dbUser.create(email, hash, name);
      await dbUserAccount.create(user.id, 0);

      // Generate 6-digit numeric token
      const vToken = Math.floor(100000 + Math.random() * 900000).toString();
      await dbUser.setVerificationToken(user.id, vToken);
      await EmailService.sendVerificationToken(email, vToken);
      await EmailService.sendWelcome(email, name);

      res.json({
        success: true,
        message:
          "Registration successful. Please check your email to verify your account before logging in.",
      });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  },

  async login(req, res) {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Missing fields" });

    try {
      const user = await dbUser.findByEmail(email);
      if (!user || !user.password_hash)
        return res.status(401).json({ error: "Invalid credentials" });

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });

      const token = signToken({ userId: user.id, email: user.email });

      // Set secure cookies
      res.cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // Non-httpOnly user cookie for frontend state
      const userData = {
        id: user.id,
        name: user.name,
        email: user.email,
        is_verified: user.is_verified,
        is_admin: user.is_admin,
      };
      res.cookie("user", JSON.stringify(userData), {
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        user: userData,
        token, // Still return token for mobile apps or header-based clients
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  },

  async logout(req, res) {
    res.clearCookie("token");
    res.clearCookie("user");
    res.json({ success: true, message: "Logged out successfully" });
  },

  async checkAuth(req, res) {
    res.json({
      valid: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        is_verified: req.user.is_verified,
        is_admin: req.user.is_admin,
      },
    });
  },

  async verifyEmail(req, res) {
    const { email, token } = req.body;
    if (!token || !email)
      return res
        .status(400)
        .json({ error: "Email and verification token required" });

    try {
      const user = await dbUser.findByEmail(email);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.verification_token !== token) {
        return res.status(400).json({ error: "Invalid verification token" });
      }

      await dbUser.verify(user.id);
      res.json({ success: true, message: "Email verified successfully" });
    } catch (err) {
      console.error("Verification error:", err);
      res.status(500).json({ error: "Verification failed" });
    }
  },

  async resendVerification(req, res) {
    if (req.user.is_verified)
      return res.status(400).json({ error: "Already verified" });

    try {
      const token = Math.floor(100000 + Math.random() * 900000).toString();
      await dbUser.setVerificationToken(req.user.id, token);
      await EmailService.sendVerificationToken(req.user.email, token);
      res.json({ success: true, message: "Verification link sent" });
    } catch (err) {
      res.status(500).json({ error: "Failed to resend link" });
    }
  },
};
