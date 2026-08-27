import config from "../config.js";
import { HttpError } from "../utils/validate.js";

export const notFound = (req, res) => {
  res.status(404).json({ error: "Endpoint not found", code: "NOT_FOUND" });
};

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
export const errorHandler = (err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }

  // express.json() body-parser failures
  if (err?.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ error: "Malformed JSON body", code: "INVALID_JSON" });
  }
  if (err?.type === "entity.too.large") {
    return res
      .status(413)
      .json({ error: "Request body is too large", code: "PAYLOAD_TOO_LARGE" });
  }

  // Prisma "record not found"
  if (err?.code === "P2025") {
    return res.status(404).json({ error: "Record not found", code: "NOT_FOUND" });
  }
  // Prisma unique constraint
  if (err?.code === "P2002") {
    return res
      .status(409)
      .json({ error: "That value is already in use", code: "CONFLICT" });
  }

  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);

  res.status(500).json({
    error: "Something went wrong. Please try again.",
    code: "INTERNAL_ERROR",
    ...(config.isProd ? {} : { detail: err?.message }),
  });
};
