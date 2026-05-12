const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query, withTransaction } = require("../config/database");
const { env } = require("../config/env");
const { randomToken, hashValue } = require("../utils/crypto");
const { AppError } = require("../utils/errors");
const { normalizeEmail, normalizePhone, validatePassword, validatePin, requiredText } = require("../utils/validators");
const { getDeviceFingerprint, getIpAddress } = require("../utils/http");
const { logAuditEvent } = require("./audit-service");

const ACCESS_COOKIE = "crane_access_token";
const REFRESH_COOKIE = "crane_refresh_token";

function buildAccessToken(account, sessionId) {
  return jwt.sign(
    {
      sub: account.id,
      role: account.role,
      sessionId
    },
    env.jwtAccessSecret,
    {
      expiresIn: `${env.accessTokenTtlMinutes}m`
    }
  );
}

function getCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    domain: env.cookieDomain,
    path: "/",
    maxAge: maxAgeMs
  };
}

function setAnonymousCsrfCookie(res, csrfToken) {
  res.cookie(env.csrfCookieName, csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: env.cookieSecure,
    domain: env.cookieDomain,
    path: "/",
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000
  });
}

function setAuthCookies(res, { accessToken, refreshToken, csrfToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, getCookieOptions(env.accessTokenTtlMinutes * 60 * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, getCookieOptions(env.refreshTokenTtlDays * 24 * 60 * 60 * 1000));
  setAnonymousCsrfCookie(res, csrfToken);
}

function clearAuthCookies(res) {
  const base = {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    domain: env.cookieDomain,
    path: "/"
  };
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
  res.clearCookie(env.csrfCookieName, {
    ...base,
    httpOnly: false
  });
}

async function createSession(client, req, account) {
  const refreshToken = randomToken();
  const csrfToken = randomToken(24);
  const deviceFingerprint = hashValue(getDeviceFingerprint(req));
  const userAgent = req.headers["user-agent"] || "unknown";
  const ipAddress = getIpAddress(req);
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

  const linkedDevice = await client.query(
    `SELECT account_id FROM account_devices WHERE fingerprint_hash = $1 LIMIT 1`,
    [deviceFingerprint]
  );
  // Temporarily disabled device restriction for development
  /*
  if (linkedDevice.rowCount > 0 && linkedDevice.rows[0].account_id !== account.id && account.role === "user") {
    throw new AppError(409, "This device is already linked to another borrower account.");
  }
  */

  const sessionResult = await client.query(
    `INSERT INTO sessions (account_id, refresh_token_hash, csrf_token_hash, device_fingerprint_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [account.id, hashValue(refreshToken), hashValue(csrfToken), deviceFingerprint, userAgent, ipAddress, expiresAt]
  );

  await client.query(
    `INSERT INTO account_devices (account_id, fingerprint_hash, device_label, first_ip_address, last_ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (fingerprint_hash)
     DO UPDATE SET account_id = EXCLUDED.account_id,
                   last_ip_address = EXCLUDED.last_ip_address,
                   user_agent = EXCLUDED.user_agent,
                   last_seen_at = NOW()`,
    [account.id, deviceFingerprint, "Browser session", ipAddress, ipAddress, userAgent]
  );

  const accessToken = buildAccessToken(account, sessionResult.rows[0].id);
  return {
    accessToken,
    refreshToken,
    csrfToken,
    sessionId: sessionResult.rows[0].id
  };
}

async function createUserAccount(payload, req) {
  const fullName = requiredText(payload.fullName, "Full name");
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  const pin = validatePin(payload.pin);

  if (!phone) {
    throw new AppError(400, "Phone number is required.");
  }

  const result = await withTransaction(async (client) => {
    // Temporarily disabled device restriction for development
    /*
    const fingerprintHash = hashValue(getDeviceFingerprint(req));
    const duplicateDevice = await client.query(
      `SELECT account_id FROM account_devices WHERE fingerprint_hash = $1`,
      [fingerprintHash]
    );
    if (duplicateDevice.rowCount > 0) {
      throw new AppError(409, "This device is already linked to another account. Contact support if you need assistance.");
    }
    */

    const duplicate = await client.query(
      `SELECT id FROM accounts WHERE phone = $1 OR ($2::text IS NOT NULL AND email = $2)`,
      [phone, email]
    );
    if (duplicate.rowCount > 0) {
      throw new AppError(409, "An account already exists with that phone number or email.");
    }

    const passwordHash = await bcrypt.hash(pin, 12);
    const accountResult = await client.query(
      `INSERT INTO accounts (role, full_name, email, phone, pin_hash, profile)
       VALUES ('user', $1, $2, $3, $4, $5)
       RETURNING id, role, admin_role, full_name, email, phone, status, verification_status, permissions, profile, created_at, updated_at`,
      [fullName, email, phone, passwordHash, JSON.stringify({
        registrationIp: getIpAddress(req),
        fullName: fullName,
        email: email,
        phone: phone,
        registrationDate: new Date().toISOString()
      })]
    );

    const account = accountResult.rows[0];
    const session = await createSession(client, req, account);

    return { account, session };
  });
  await logAuditEvent({
    actorAccountId: result.account.id,
    actorRole: "user",
    action: "account.registered",
    entityType: "account",
    entityId: result.account.id,
    ipAddress: getIpAddress(req),
    metadata: { email, phone }
  });
  return result;
}

async function assertLoginAttemptsAllowed(identifier) {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM security_events
     WHERE identifier = $1
       AND event_type = 'login.failed'
       AND created_at >= NOW() - ($2::text || ' minutes')::interval`,
    [identifier, env.maxFailedLoginWindowMinutes]
  );
  if (result.rows[0]?.count >= env.maxFailedLoginAttempts) {
    throw new AppError(429, "Too many failed login attempts. Try again later.");
  }
}

async function recordSecurityEvent({ accountId = null, identifier, eventType, severity = "warning", req, metadata = {} }) {
  await query(
    `INSERT INTO security_events (account_id, identifier, event_type, severity, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [accountId, identifier, eventType, severity, getIpAddress(req), req.headers["user-agent"] || "unknown", JSON.stringify(metadata)]
  );
}

async function loginUser(payload, req) {
  const identifierRaw = payload.identifier || payload.email || payload.phone;
  const secret = payload.secret || payload.password || payload.pin;
  const identifier = String(identifierRaw || "").trim().toLowerCase();

  if (!identifier || !secret) {
    throw new AppError(400, "Credentials are required.");
  }

  await assertLoginAttemptsAllowed(identifier);

  const email = identifier.includes("@") ? normalizeEmail(identifier) : null;
  const phone = identifier.includes("@") ? null : normalizePhone(identifier);
  const accountResult = await query(
    `SELECT * FROM accounts WHERE role = 'user' AND ((email = $1 AND $1::text IS NOT NULL) OR (phone = $2 AND $2::text IS NOT NULL)) LIMIT 1`,
    [email, phone]
  );
  const account = accountResult.rows[0];

  if (!account || !account.pin_hash) {
    await recordSecurityEvent({ identifier, eventType: "login.failed", req, metadata: { reason: "account_not_found" } });
    throw new AppError(401, "Invalid login credentials.");
  }
  if (account.status !== "active") {
    throw new AppError(403, "Your account is not active. Contact support.");
  }

  const valid = await bcrypt.compare(String(secret), account.pin_hash);
  if (!valid) {
    await recordSecurityEvent({ accountId: account.id, identifier, eventType: "login.failed", req, metadata: { reason: "invalid_secret" } });
    throw new AppError(401, "Invalid login credentials.");
  }

  return withTransaction(async (client) => {
    await client.query("UPDATE accounts SET last_login_at = NOW() WHERE id = $1", [account.id]);
    const session = await createSession(client, req, account);
    await logAuditEvent({
      client,
      actorAccountId: account.id,
      actorRole: account.role,
      action: "auth.login",
      entityType: "session",
      entityId: session.sessionId,
      ipAddress: getIpAddress(req),
      metadata: { identifier }
    });
    return { account, session };
  });
}

async function loginAdmin(payload, req) {
  const username = requiredText(payload.username, "Username").toLowerCase();
  const pin = validatePin(payload.pin);
  await assertLoginAttemptsAllowed(username);

  const result = await query(
    `SELECT * FROM accounts WHERE username = $1 AND role = 'admin' LIMIT 1`,
    [username]
  );
  const account = result.rows[0];
  if (!account || !account.pin_hash) {
    await recordSecurityEvent({ identifier: username, eventType: "login.failed", req, metadata: { role: "admin", reason: "account_not_found" } });
    throw new AppError(401, "Invalid admin credentials.");
  }
  if (account.status !== "active") {
    throw new AppError(403, "This admin account is disabled.");
  }

  const valid = await bcrypt.compare(pin, account.pin_hash);
  if (!valid) {
    await recordSecurityEvent({ accountId: account.id, identifier: username, eventType: "login.failed", req, metadata: { role: "admin", reason: "invalid_secret" } });
    throw new AppError(401, "Invalid admin credentials.");
  }

  return withTransaction(async (client) => {
    await client.query("UPDATE accounts SET last_login_at = NOW() WHERE id = $1", [account.id]);
    const session = await createSession(client, req, account);
    return { account, session };
  });
}

async function ensureSuperAdminAccount() {
  const existing = await query(
    `SELECT * FROM accounts WHERE role = 'super_admin' AND username = $1 LIMIT 1`,
    [env.superAdminUsername.toLowerCase()]
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const passwordHash = await bcrypt.hash(validatePassword(env.superAdminPassword), 12);
  const result = await query(
    `INSERT INTO accounts (role, full_name, email, username, password_hash, verification_status, permissions)
     VALUES ('super_admin', $1, $2, $3, $4, 'verified', $5)
     RETURNING *`,
    [
      env.superAdminName,
      normalizeEmail(env.superAdminEmail),
      env.superAdminUsername.toLowerCase(),
      passwordHash,
      JSON.stringify(["admins:create", "admins:disable", "backups:restore", "accounts:force-logout", "settings:update"])
    ]
  );
  return result.rows[0];
}

async function loginSuperAdmin(payload, req) {
  const username = requiredText(payload.username, "Username").toLowerCase();
  const password = validatePassword(payload.password);
  await assertLoginAttemptsAllowed(username);

  const account = await ensureSuperAdminAccount();
  if (account.username !== username) {
    await recordSecurityEvent({ identifier: username, eventType: "login.failed", req, metadata: { role: "super_admin", reason: "username_mismatch" } });
    throw new AppError(401, "Invalid super admin credentials.");
  }

  const valid = await bcrypt.compare(password, account.password_hash);
  if (!valid) {
    await recordSecurityEvent({ accountId: account.id, identifier: username, eventType: "login.failed", req, metadata: { role: "super_admin", reason: "invalid_secret" } });
    throw new AppError(401, "Invalid super admin credentials.");
  }

  return withTransaction(async (client) => {
    await client.query("UPDATE accounts SET last_login_at = NOW() WHERE id = $1", [account.id]);
    const freshAccountResult = await client.query("SELECT * FROM accounts WHERE id = $1", [account.id]);
    const freshAccount = freshAccountResult.rows[0];
    const session = await createSession(client, req, freshAccount);
    return { account: freshAccount, session };
  });
}

async function refreshSession(req) {
  const refreshToken = req.cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    throw new AppError(401, "Refresh token is missing.");
  }

  const result = await query(
    `SELECT s.*, a.*
     FROM sessions s
     JOIN accounts a ON a.id = s.account_id
     WHERE s.refresh_token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     LIMIT 1`,
    [hashValue(refreshToken)]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError(401, "Session expired. Please sign in again.");
  }
  if (row.status !== "active") {
    throw new AppError(403, "This account is not active.");
  }

  const account = {
    id: row.account_id,
    role: row.role,
    admin_role: row.admin_role,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    username: row.username,
    status: row.status,
    verification_status: row.verification_status,
    permissions: row.permissions,
    profile: row.profile,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
  const accessToken = buildAccessToken(account, row.id);
  await query("UPDATE sessions SET last_seen_at = NOW(), ip_address = $2 WHERE id = $1", [row.id, getIpAddress(req)]);
  return {
    account,
    session: {
      accessToken,
      refreshToken,
      csrfToken: req.cookies[env.csrfCookieName] || randomToken(24),
      sessionId: row.id
    }
  };
}

async function revokeCurrentSession(req) {
  const refreshToken = req.cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    return;
  }
  await query(
    `UPDATE sessions
     SET revoked_at = NOW()
     WHERE refresh_token_hash = $1`,
    [hashValue(refreshToken)]
  );
}

async function revokeAllSessionsForAccount(accountId) {
  await query(
    `UPDATE sessions
     SET revoked_at = NOW()
     WHERE account_id = $1 AND revoked_at IS NULL`,
    [accountId]
  );
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  createUserAccount,
  ensureSuperAdminAccount,
  loginUser,
  loginAdmin,
  loginSuperAdmin,
  refreshSession,
  revokeCurrentSession,
  revokeAllSessionsForAccount,
  setAnonymousCsrfCookie,
  setAuthCookies
};
