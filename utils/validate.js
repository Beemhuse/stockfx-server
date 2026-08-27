// Small dependency-free validation / sanitisation helpers.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message, code) => new HttpError(400, message, code);

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return null;
  return email;
}

export function requireEmail(value, field = "email") {
  const email = normalizeEmail(value);
  if (!email) throw badRequest(`A valid ${field} is required`, "INVALID_EMAIL");
  return email;
}

export function requirePassword(value) {
  if (typeof value !== "string" || value.length < 8) {
    throw badRequest(
      "Password must be at least 8 characters long",
      "WEAK_PASSWORD",
    );
  }
  if (value.length > 200) {
    throw badRequest("Password is too long", "WEAK_PASSWORD");
  }
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw badRequest(
      "Password must contain at least one letter and one number",
      "WEAK_PASSWORD",
    );
  }
  return value;
}

export function requireName(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest("Name is required", "INVALID_NAME");
  }
  const name = value.trim();
  if (name.length > 120) throw badRequest("Name is too long", "INVALID_NAME");
  return name;
}

export function requireOtp(value) {
  const code = typeof value === "string" ? value.trim() : String(value ?? "");
  if (!/^\d{6}$/.test(code)) {
    throw badRequest("Enter the 6-digit code from your email", "INVALID_OTP");
  }
  return code;
}

export function requireUuid(value, field = "id") {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw badRequest(`A valid ${field} is required`, "INVALID_ID");
  }
  return value;
}

const MAX_MONEY = 1_000_000_000_000;

/**
 * Numbers must arrive as a number or a non-empty numeric string. `null`,
 * booleans and "" would otherwise coerce to 0 and silently zero a balance.
 */
function toNumber(value, field) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  throw badRequest(`${field} must be a number`, "INVALID_AMOUNT");
}

/** Money that must be strictly positive (transaction amounts). */
export function requirePositiveAmount(value, field = "amount") {
  const amount = toNumber(value, field);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw badRequest(`A valid ${field} greater than 0 is required`, "INVALID_AMOUNT");
  }
  if (amount > MAX_MONEY) {
    throw badRequest(`${field} exceeds the allowed maximum`, "INVALID_AMOUNT");
  }
  return Math.round(amount * 100) / 100;
}

/** Money that may be zero or negative-free (balances, profit, income). */
export function requireMoney(value, field = "value", { allowNegative = false } = {}) {
  const amount = toNumber(value, field);
  if (!Number.isFinite(amount)) {
    throw badRequest(`${field} must be a number`, "INVALID_AMOUNT");
  }
  if (!allowNegative && amount < 0) {
    throw badRequest(`${field} cannot be negative`, "INVALID_AMOUNT");
  }
  if (Math.abs(amount) > MAX_MONEY) {
    throw badRequest(`${field} exceeds the allowed maximum`, "INVALID_AMOUNT");
  }
  return Math.round(amount * 100) / 100;
}

/** Whole-number count (active trades). */
export function requireCount(value, field = "value") {
  const n = toNumber(value, field);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw badRequest(`${field} must be a whole number of 0 or more`, "INVALID_COUNT");
  }
  if (n > 1_000_000) throw badRequest(`${field} is too large`, "INVALID_COUNT");
  return n;
}

export const ACCOUNT_TYPES = ["standard", "gold", "premium", "vip"];

export function requireAccountType(value) {
  const type = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!ACCOUNT_TYPES.includes(type)) {
    throw badRequest(
      `Account type must be one of: ${ACCOUNT_TYPES.join(", ")}`,
      "INVALID_ACCOUNT_TYPE",
    );
  }
  return type;
}

export function requireText(value, field, max = 2000) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${field} is required`, "INVALID_TEXT");
  }
  const text = value.trim();
  if (text.length > max) throw badRequest(`${field} is too long`, "INVALID_TEXT");
  return text;
}

/** Escape user-supplied content before interpolating it into an HTML email. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const formatMoney = (value) =>
  Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
