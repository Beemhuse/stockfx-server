import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export const isAdmin = async (req, res, next) => {
  // If authenticate middleware has already run and populated req.user
  if (req.user && req.user.is_admin) {
    return next();
  }

  // Otherwise check admin_token cookie (legacy or standalone admin session)
  const token =
    req.cookies.admin_token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role === "admin" || decoded.isAdmin) {
      req.admin = decoded;
      return next();
    }
    return res.status(403).json({ error: "Forbidden: Not an admin" });
  } catch (err) {
    return res.status(403).json({ error: "Forbidden: Invalid session" });
  }
};
