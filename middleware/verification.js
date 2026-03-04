export const requireVerification = (req, res, next) => {
  if (req.user && !req.user.is_verified) {
    return res.status(403).json({
      error: "Account not verified",
      message: "Please verify your account to access this feature.",
    });
  }
  next();
};

export const checkVerification = (req, res, next) => {
  // Just attaches info, doesn't block
  req.isVerified = req.user?.is_verified || false;
  next();
};
