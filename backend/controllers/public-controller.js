const { env } = require("../config/env");
const { setAnonymousCsrfCookie } = require("../services/auth-service");
const { randomToken } = require("../utils/crypto");

function health(_req, res) {
  res.json({
    status: "ok",
    service: "crane-credit-platform",
    time: new Date().toISOString()
  });
}

function bootstrap(req, res) {
  const csrfToken = req.cookies[env.csrfCookieName] || randomToken(24);
  setAnonymousCsrfCookie(res, csrfToken);

  res.json({
    appName: "Crane Credit",
    csrfCookieName: env.csrfCookieName,
    roles: ["user", "admin", "super_admin"],
    auth: req.auth
      ? {
          id: req.auth.id,
          role: req.auth.role,
          fullName: req.auth.full_name
        }
      : null
  });
}

module.exports = {
  health,
  bootstrap
};
