/**
 * Admin authorisation. Must run after `authenticate`, which loads the user
 * from the database. The `is_admin` flag is read from that row - never from a
 * JWT claim or a cookie the client can set.
 */
export const isAdmin = (req, res, next) => {
  if (req.user?.is_admin === true) return next();
  return res
    .status(403)
    .json({ error: "Administrator access required", code: "FORBIDDEN" });
};

export default isAdmin;
