const { query } = require("../config/database");
const { env } = require("../config/env");
const { AppError } = require("../utils/errors");
const { hashValue } = require("../utils/crypto");

const SESSION_OPTIONAL_CSRF_PATHS = new Set([
  "/auth/register",
  "/auth/login",
  "/auth/admin/login",
  "/auth/super-admin/login",
  "/auth/refresh"
]);

async function verifyCsrf(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies[env.csrfCookieName];
  const headerToken = req.headers["x-csrf-token"];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new AppError(403, "CSRF validation failed."));
  }

  if (SESSION_OPTIONAL_CSRF_PATHS.has(req.path)) {
    return next();
  }

  if (req.auth?.sessionId) {
    const result = await query(
      `SELECT id
       FROM sessions
       WHERE id = $1
         AND csrf_token_hash = $2
         AND revoked_at IS NULL
         AND expires_at > NOW()`,
      [req.auth.sessionId, hashValue(cookieToken)]
    );
    if (result.rowCount === 0) {
      return next(new AppError(403, "CSRF token is no longer valid."));
    }
  }

  return next();
}

module.exports = { verifyCsrf };
