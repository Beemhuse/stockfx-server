import jwt from "jsonwebtoken";
import config from "../config.js";
import { dbUser } from "../db.js";

const bearer = (req) => {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value : null;
};

export const extractToken = (req) =>
  req.cookies?.token || req.cookies?.admin_token || bearer(req);

export const authenticate = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res
      .status(401)
      .json({ error: "Authentication required", code: "UNAUTHENTICATED" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch {
    return res
      .status(401)
      .json({ error: "Session expired. Please sign in again.", code: "INVALID_TOKEN" });
  }

  // Claims in the token are never trusted for authorisation - reload the user.
  const user = await dbUser.findById(decoded.userId || decoded.id);
  if (!user) {
    return res
      .status(401)
      .json({ error: "Session expired. Please sign in again.", code: "INVALID_TOKEN" });
  }
  if (user.status && user.status !== "active") {
    return res
      .status(403)
      .json({ error: "This account has been suspended.", code: "ACCOUNT_SUSPENDED" });
  }

  req.user = user;
  req.token = token;
  next();
};
