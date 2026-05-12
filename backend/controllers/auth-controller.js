const { getNotificationsForAccount } = require("../models/notification-model");
const { listActiveSessionsByAccount } = require("../models/session-model");
const {
  clearAuthCookies,
  createUserAccount,
  loginAdmin,
  loginSuperAdmin,
  loginUser,
  refreshSession,
  revokeCurrentSession,
  setAuthCookies
} = require("../services/auth-service");

function serializeAccount(account) {
  return {
    id: account.id,
    role: account.role,
    adminRole: account.admin_role || null,
    fullName: account.full_name,
    email: account.email,
    phone: account.phone,
    username: account.username,
    nationalId: account.national_id,
    status: account.status,
    verificationStatus: account.verification_status,
    permissions: account.permissions || [],
    profile: account.profile || {},
    lastLoginAt: account.last_login_at,
    createdAt: account.created_at,
    updatedAt: account.updated_at
  };
}

async function respondWithSession(res, account, session) {
  setAuthCookies(res, session);
  const notifications = await getNotificationsForAccount(account.id, account);
  res.json({
    account: serializeAccount(account),
    notifications
  });
}

async function register(req, res) {
  const { account, session } = await createUserAccount(req.body, req);
  return respondWithSession(res, account, session);
}

async function login(req, res) {
  const { account, session } = await loginUser(req.body, req);
  return respondWithSession(res, account, session);
}

async function adminSignIn(req, res) {
  const { account, session } = await loginAdmin(req.body, req);
  return respondWithSession(res, account, session);
}

async function superAdminSignIn(req, res) {
  const { account, session } = await loginSuperAdmin(req.body, req);
  return respondWithSession(res, account, session);
}

async function session(req, res) {
  if (!req.auth) {
    return res.status(401).json({ error: "No active session." });
  }

  const notifications = await getNotificationsForAccount(req.auth.id, req.auth);
  const activeSessions = await listActiveSessionsByAccount(req.auth.id);
  return res.json({
    account: serializeAccount(req.auth),
    notifications,
    sessions: activeSessions
  });
}

async function refresh(req, res) {
  const { account, session } = await refreshSession(req);
  return respondWithSession(res, account, session);
}

async function logout(req, res) {
  await revokeCurrentSession(req);
  clearAuthCookies(res);
  res.json({ success: true });
}

module.exports = {
  adminSignIn,
  login,
  logout,
  refresh,
  register,
  session,
  superAdminSignIn
};
