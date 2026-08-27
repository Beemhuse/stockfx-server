import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import config, { cookieOptions } from "../config.js";
import { dbUser, dbUserAccount, dbDevice, dbSession } from "../db.js";
import { EmailService } from "../services/EmailService.js";
import { OtpService } from "../services/OtpService.js";
import {
  HttpError,
  requireEmail,
  requireName,
  requireOtp,
  requirePassword,
} from "../utils/validate.js";
import { clientIp } from "../middleware/rateLimit.js";

const BCRYPT_ROUNDS = 12;

const signToken = (user) =>
  jwt.sign(
    { userId: user.id, email: user.email, is_admin: user.is_admin === true },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  is_verified: user.is_verified === true,
  is_admin: user.is_admin === true,
});

const setSessionCookies = (res, user, token) => {
  res.cookie("token", token, cookieOptions());
  // Readable by the SPA for instant UI state only - the server never trusts it.
  res.cookie(
    "user",
    JSON.stringify(publicUser(user)),
    cookieOptions({ httpOnly: false }),
  );
};

const registerDevice = async (req, user, token) => {
  const { deviceId, deviceName, deviceType, browser, os } = req.body || {};
  if (!deviceId || typeof deviceId !== "string") return null;

  const known = await dbDevice.find(user.id, deviceId.slice(0, 128));

  const device = await dbDevice.upsert(user.id, {
    deviceId: deviceId.slice(0, 128),
    deviceName: typeof deviceName === "string" ? deviceName.slice(0, 128) : null,
    deviceType: ["web", "mobile", "desktop"].includes(deviceType)
      ? deviceType
      : "web",
    browser: typeof browser === "string" ? browser.slice(0, 64) : null,
    os: typeof os === "string" ? os.slice(0, 64) : null,
    ipAddress: clientIp(req),
  });

  await dbSession.upsert(
    device.id,
    user.id,
    token,
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  );
  return { device, isNew: !known };
};

/** Deliver a signup/verification code, failing loudly if mail delivery fails. */
const deliverCode = async (email, name, { welcome = false } = {}) => {
  const { code } = await OtpService.issue(email, "verify");
  // Never print a live code in production - logs are not a secure channel.
  if (!config.isProd) console.log(`[OTP:DEV] issued ${code} for ${email}`);
  const result = welcome
    ? await EmailService.sendSignupOtp(email, code, name)
    : await EmailService.sendOTP(email, code);

  if (!result.sent && config.isProd) {
    throw new HttpError(
      502,
      "We could not send the verification email. Please try again shortly.",
      "EMAIL_SEND_FAILED",
    );
  }
  if (!result.sent) {
    // Development convenience only - never reached when RESEND_API_KEY is set.
    console.log(`[OTP:DEV] ${email} -> ${code}`);
  }
};

export const AuthController = {
  /**
   * Step 1 of sign-up. Creates the (unverified) account and emails a 6-digit
   * code via Resend. The code is generated server-side - clients never supply it.
   */
  async register(req, res, next) {
    try {
      const email = requireEmail(req.body?.email);
      const name = requireName(req.body?.name);
      const password = requirePassword(req.body?.password);

      const existing = await dbUser.findByEmail(email);

      if (existing?.is_verified) {
        throw new HttpError(
          409,
          "An account with this email already exists. Please sign in.",
          "EMAIL_IN_USE",
        );
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      if (existing) {
        // Unverified signup being retried: refresh the credentials, resend a code.
        await dbUser.updateCredentials(existing.id, { passwordHash, name });
        await dbUserAccount.ensure(existing.id);
      } else {
        const user = await dbUser.create(email, passwordHash, name);
        await dbUserAccount.create(user.id, 0);
      }

      await deliverCode(email, name, { welcome: true });

      res.status(201).json({
        success: true,
        requiresVerification: true,
        email,
        message:
          "Account created. Enter the 6-digit code we emailed you to activate it.",
      });
    } catch (err) {
      next(err);
    }
  },

  /** Step 2 of sign-up: confirm the emailed code. */
  async verifyOTP(req, res, next) {
    try {
      const email = requireEmail(req.body?.email);
      const code = requireOtp(req.body?.otp ?? req.body?.code ?? req.body?.token);

      const user = await dbUser.findByEmail(email);
      if (!user) {
        throw new HttpError(
          400,
          "That code has expired or was already used. Request a new one.",
          "OTP_EXPIRED",
        );
      }

      if (user.is_verified) {
        return res.json({
          success: true,
          alreadyVerified: true,
          message: "Your account is already verified. You can sign in.",
        });
      }

      await OtpService.verify(email, code, "verify");
      await dbUser.verify(user.id);
      await dbUserAccount.ensure(user.id);
      await EmailService.sendWelcome(email, user.name);

      res.json({
        success: true,
        message: "Email verified successfully. You can now sign in.",
      });
    } catch (err) {
      next(err);
    }
  },

  /** Re-send a signup confirmation code. */
  async resendOTP(req, res, next) {
    try {
      const email = requireEmail(req.body?.email);
      const user = await dbUser.findByEmail(email);

      // Uniform response: do not let this endpoint enumerate accounts.
      const genericResponse = {
        success: true,
        message:
          "If that email needs verification, a new code is on its way. Check your inbox.",
      };

      if (!user || user.is_verified) return res.json(genericResponse);

      await deliverCode(email, user.name);
      res.json(genericResponse);
    } catch (err) {
      next(err);
    }
  },

  async login(req, res, next) {
    try {
      const email = requireEmail(req.body?.email);
      const password = req.body?.password;
      if (typeof password !== "string" || !password) {
        throw new HttpError(400, "Password is required", "MISSING_PASSWORD");
      }

      const user = await dbUser.findByEmail(email);
      const passwordOk =
        user?.password_hash && (await bcrypt.compare(password, user.password_hash));

      if (!user || !passwordOk) {
        throw new HttpError(401, "Invalid email or password", "INVALID_CREDENTIALS");
      }

      if (user.status && user.status !== "active") {
        throw new HttpError(
          403,
          "This account has been suspended. Contact support.",
          "ACCOUNT_SUSPENDED",
        );
      }

      // Email confirmation is mandatory before the first sign-in.
      if (!user.is_verified) {
        try {
          await deliverCode(email, user.name);
        } catch (err) {
          if (err.code !== "OTP_COOLDOWN") throw err;
        }
        throw new HttpError(
          403,
          "Please confirm your email address. We have sent you a 6-digit code.",
          "EMAIL_NOT_VERIFIED",
        );
      }

      const token = signToken(user);
      setSessionCookies(res, user, token);
      await dbUserAccount.ensure(user.id);

      const registration = await registerDevice(req, user, token);
      if (registration?.isNew) {
        await EmailService.sendNewDeviceAlert(user.email, {
          deviceName: registration.device.device_name,
          os: registration.device.os,
          browser: registration.device.browser,
          ip: registration.device.ip_address,
        });
      }

      res.json({ success: true, user: publicUser(user), token });
    } catch (err) {
      next(err);
    }
  },

  async logout(req, res) {
    const clear = { ...cookieOptions(), maxAge: undefined };
    res.clearCookie("token", clear);
    res.clearCookie("user", { ...clear, httpOnly: false });
    res.clearCookie("admin_token", clear);
    res.json({ success: true, message: "Logged out successfully" });
  },

  async checkAuth(req, res) {
    res.json({ valid: true, user: publicUser(req.user) });
  },
};

export default AuthController;
