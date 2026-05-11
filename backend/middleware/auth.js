const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { AppError } = require("../utils/errors");
const { ACCESS_COOKIE } = require("../services/auth-service");
const { findById } = require("../models/account-model");

async function attachAuth(req, _res, next) {
  try {
    const token = req.cookies[ACCESS_COOKIE];
    if (!token) {
      req.auth = null;
      return next();
    }

    const payload = jwt.verify(token, env.jwtAccessSecret);
    const account = await findById(payload.sub);
    if (!account || account.status !== "active") {
      req.auth = null;
      return next();
    }

    req.auth = {
      ...account,
      sessionId: payload.sessionId
    };
    return next();
  } catch (error) {
    req.auth = null;
    return next();
  }
}

function requireAuth(req, _res, next) {
  if (!req.auth) {
    return next(new AppError(401, "Authentication required."));
  }
  return next();
}

function requireRoles(...roles) {
  return function roleGuard(req, _res, next) {
    if (!req.auth) {
      return next(new AppError(401, "Authentication required."));
    }
    if (!roles.includes(req.auth.role)) {
      return next(new AppError(403, "You do not have permission to perform this action."));
    }
    return next();
  };
}

module.exports = {
  attachAuth,
  requireAuth,
  requireRoles
};
