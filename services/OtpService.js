import crypto from "crypto";
import config from "../config.js";
import { dbOtp } from "../db.js";
import { HttpError } from "../utils/validate.js";

const hash = (code) =>
  crypto.createHash("sha256").update(String(code)).digest("hex");

/** Cryptographically secure 6-digit code (no Math.random). */
const generateCode = () => {
  const max = 10 ** config.otp.length;
  return String(crypto.randomInt(0, max)).padStart(config.otp.length, "0");
};

export const OtpService = {
  /**
   * Issue a fresh code, invalidating any outstanding one for the same purpose.
   * Enforces a resend cooldown so the endpoint cannot be used to spam inboxes.
   */
  async issue(email, purpose = "verify", { enforceCooldown = true } = {}) {
    if (enforceCooldown) {
      const lastIssued = await dbOtp.lastIssuedAt(email, purpose);
      if (lastIssued) {
        const elapsed = (Date.now() - new Date(lastIssued).getTime()) / 1000;
        const wait = Math.ceil(config.otp.resendCooldownSeconds - elapsed);
        if (wait > 0) {
          throw new HttpError(
            429,
            `Please wait ${wait} second${wait === 1 ? "" : "s"} before requesting another code.`,
            "OTP_COOLDOWN",
          );
        }
      }
    }

    await dbOtp.invalidateAll(email, purpose);

    const code = generateCode();
    const expiresAt = new Date(Date.now() + config.otp.ttlMinutes * 60 * 1000);
    await dbOtp.create(email, hash(code), expiresAt, purpose);

    return { code, expiresAt };
  },

  /**
   * Verify a submitted code. Throws an HttpError with a user-safe message when
   * the code is wrong, expired, or too many attempts have been made.
   */
  async verify(email, code, purpose = "verify") {
    const record = await dbOtp.findActive(email, purpose);
    if (!record) {
      throw new HttpError(
        400,
        "That code has expired or was already used. Request a new one.",
        "OTP_EXPIRED",
      );
    }

    if ((record.attempts ?? 0) >= config.otp.maxAttempts) {
      await dbOtp.consume(record.id);
      throw new HttpError(
        429,
        "Too many incorrect attempts. Request a new code.",
        "OTP_ATTEMPTS_EXCEEDED",
      );
    }

    const expected = record.code.slice(purpose.length + 1);
    const provided = hash(code);
    const matches =
      expected.length === provided.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));

    if (!matches) {
      const updated = await dbOtp.incrementAttempts(record.id);
      const left = Math.max(0, config.otp.maxAttempts - (updated.attempts ?? 0));
      throw new HttpError(
        400,
        left > 0
          ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.`
          : "Incorrect code. Request a new one.",
        "OTP_INVALID",
      );
    }

    await dbOtp.consume(record.id);
    return true;
  },
};

export default OtpService;
