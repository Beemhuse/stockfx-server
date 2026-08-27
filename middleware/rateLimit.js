// Dependency-free fixed-window rate limiter.
// Good enough for a single-instance deployment; swap for a Redis-backed limiter
// if the API is ever scaled horizontally.

const buckets = new Map();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

/** Clears every window. Exposed for tests; never called by the app. */
export const resetRateLimits = () => buckets.clear();

export const clientIp = (req) =>
  (req.headers["x-forwarded-for"]?.split(",")[0] || "").trim() ||
  req.ip ||
  req.socket?.remoteAddress ||
  "unknown";

/**
 * @param {object} opts
 * @param {number} opts.windowMs   window size
 * @param {number} opts.max        max requests per window
 * @param {string} opts.name       bucket namespace
 * @param {(req) => string} [opts.keyGenerator]
 */
export function rateLimit({
  windowMs = 60_000,
  max = 30,
  name = "default",
  keyGenerator,
  message = "Too many requests. Please try again later.",
}) {
  return (req, res, next) => {
    const key = `${name}:${keyGenerator ? keyGenerator(req) : clientIp(req)}`;
    const now = Date.now();
    let entry = buckets.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil((entry.resetAt - now) / 1000)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ error: message, code: "RATE_LIMITED", retryAfter });
    }

    next();
  };
}

/** Key on the submitted email (falling back to IP) so one attacker can't lock everyone out. */
export const emailKey = (req) => {
  const email =
    typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
  return email || clientIp(req);
};
