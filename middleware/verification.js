/** Blocks the request until the signed-in user has confirmed their email. */
export const requireVerification = (req, res, next) => {
  if (req.user && req.user.is_verified !== true) {
    return res.status(403).json({
      error: "Please confirm your email address to use this feature.",
      code: "EMAIL_NOT_VERIFIED",
    });
  }
  next();
};

/** Non-blocking variant - just annotates the request. */
export const checkVerification = (req, res, next) => {
  req.isVerified = req.user?.is_verified === true;
  next();
};
