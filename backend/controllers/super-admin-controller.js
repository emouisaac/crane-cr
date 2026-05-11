const bcrypt = require("bcryptjs");
const { query } = require("../config/database");
const { listAdmins, listUsers } = require("../models/account-model");
const { getAllLoans } = require("../models/loan-model");
const { getNotificationsForAccount } = require("../models/notification-model");
const { createBackup, listBackups, restoreBackup } = require("../services/backup-service");
const { createNotification } = require("../services/notification-service");
const { revokeAllSessionsForAccount } = require("../services/auth-service");
const { emitToAccount, emitToRole } = require("../services/socket-bus");
const { logAuditEvent } = require("../services/audit-service");
const { AppError } = require("../utils/errors");
const { normalizeEmail, normalizePhone, requiredText, sanitizeNullableString, validatePin } = require("../utils/validators");
const { getIpAddress } = require("../utils/http");

async function dashboard(req, res) {
  const [admins, users, loans, notifications, securityEvents, backups, settings] = await Promise.all([
    listAdmins(),
    listUsers(),
    getAllLoans(),
    getNotificationsForAccount(req.auth.id, req.auth.role),
    query("SELECT * FROM security_events ORDER BY created_at DESC LIMIT 50"),
    listBackups(),
    query("SELECT * FROM app_settings ORDER BY key ASC")
  ]);

  res.json({
    admins,
    users,
    loans,
    notifications,
    backups,
    securityEvents: securityEvents.rows,
    settings: settings.rows,
    summary: {
      totalUsers: users.length,
      totalAdmins: admins.filter((admin) => admin.role === "admin").length,
      suspendedAccounts: users.filter((user) => user.status === "suspended").length + admins.filter((admin) => admin.status !== "active").length,
      liveApplications: loans.filter((loan) => ["submitted", "under_review", "verification"].includes(loan.status)).length
    }
  });
}

async function createAdmin(req, res) {
  const role = String(req.body.role || "admin").trim().toLowerCase();
  if (role !== "admin") {
    throw new AppError(400, "Role must be admin.");
  }

  const username = requiredText(req.body.username, "Username").toLowerCase();
  const fullName = requiredText(req.body.fullName, "Full name");
  const pinHash = await bcrypt.hash(validatePin(req.body.pin), 12);
  const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];
  const email = req.body.email ? normalizeEmail(req.body.email) : null;
  const phone = req.body.phone ? normalizePhone(req.body.phone) : null;

  const duplicate = await query(
    `SELECT username, email, phone
     FROM accounts
     WHERE username = $1
        OR ($2::text IS NOT NULL AND email = $2)
        OR ($3::text IS NOT NULL AND phone = $3)
     LIMIT 1`,
    [username, email, phone]
  );
  if (duplicate.rowCount > 0) {
    const existing = duplicate.rows[0];
    if (existing.username === username) {
      throw new AppError(409, "That username is already in use.");
    }
    if (email && existing.email === email) {
      throw new AppError(409, "That email address is already in use.");
    }
    if (phone && existing.phone === phone) {
      throw new AppError(409, "That phone number is already in use.");
    }
    throw new AppError(409, "An account already exists with those details.");
  }

  let result;
  try {
    result = await query(
      `INSERT INTO accounts (role, full_name, username, email, phone, pin_hash, permissions, verification_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified')
       RETURNING id, role, full_name, username, email, phone, status, permissions, created_at`,
      [role, fullName, username, email, phone, pinHash, JSON.stringify(permissions)]
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError(409, "That username, email, or phone number is already in use.");
    }
    throw error;
  }

  await createNotification({
    audienceRole: "super_admin",
    title: "Admin created",
    message: `${fullName} was created as an admin.`,
    eventType: "admin.created",
    payload: { adminId: result.rows[0].id }
  });
  emitToRole("admin", "admin:created", result.rows[0]);
  await logAuditEvent({
    actorAccountId: req.auth.id,
    actorRole: req.auth.role,
    action: "admin.created",
    entityType: "account",
    entityId: result.rows[0].id,
    ipAddress: getIpAddress(req),
    metadata: { username, permissions }
  });
  res.status(201).json({ admin: result.rows[0] });
}

async function admins(req, res) {
  const items = await listAdmins();
  res.json({ admins: items });
}

async function setAccountStatus(req, res) {
  const result = await query(
    `UPDATE accounts
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, role, full_name, email, phone, username, status`,
    [req.params.accountId, req.body.status]
  );
  const account = result.rows[0];
  if (!account) {
    return res.status(404).json({ error: "Account not found." });
  }

  if (req.body.status !== "active") {
    await revokeAllSessionsForAccount(account.id);
  }

  await createNotification({
    recipientAccountId: account.id,
    title: "Account status changed",
    message: `Your account is now ${req.body.status}.`,
    level: req.body.status === "active" ? "info" : "warning",
    eventType: "account.status_changed",
    payload: { accountId: account.id, status: req.body.status }
  });

  emitToAccount(account.id, "account:status", account);
  res.json({ account });
}

async function forceLogout(req, res) {
  await revokeAllSessionsForAccount(req.params.accountId);
  emitToAccount(req.params.accountId, "session:revoked", { accountId: req.params.accountId });
  await logAuditEvent({
    actorAccountId: req.auth.id,
    actorRole: req.auth.role,
    action: "account.force_logout",
    entityType: "account",
    entityId: req.params.accountId,
    ipAddress: getIpAddress(req),
    metadata: {}
  });
  res.json({ success: true });
}

async function auditLogs(_req, res) {
  const result = await query(
    `SELECT a.*, acc.full_name AS actor_name
     FROM audit_logs a
     LEFT JOIN accounts acc ON acc.id = a.actor_account_id
     ORDER BY a.created_at DESC
     LIMIT 200`
  );
  res.json({ logs: result.rows });
}

async function securityAlerts(_req, res) {
  const result = await query(
    `SELECT *
     FROM security_events
     ORDER BY created_at DESC
     LIMIT 200`
  );
  res.json({ events: result.rows });
}

async function backups(_req, res) {
  const items = await listBackups();
  res.json({ backups: items });
}

async function triggerBackup(req, res) {
  const backup = await createBackup({ actor: req.auth, backupType: req.body.backupType || "full" });
  res.status(201).json({ backup });
}

async function triggerRestore(req, res) {
  await restoreBackup(req.body.fileName, req.auth);
  res.json({ success: true });
}

async function updateSettings(req, res) {
  const entries = Object.entries(req.body || {});
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO app_settings (key, value, updated_by_account_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = NOW()`,
      [key, JSON.stringify(value), req.auth.id]
    );
  }
  const settings = await query("SELECT * FROM app_settings ORDER BY key ASC");
  res.json({ settings: settings.rows });
}

async function updatePermissions(req, res) {
  const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];
  const result = await query(
    `UPDATE accounts
     SET permissions = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, role, full_name, permissions`,
    [req.params.accountId, JSON.stringify(permissions)]
  );
  res.json({ account: result.rows[0] || null });
}

module.exports = {
  admins,
  auditLogs,
  backups,
  createAdmin,
  dashboard,
  forceLogout,
  securityAlerts,
  setAccountStatus,
  triggerBackup,
  triggerRestore,
  updatePermissions,
  updateSettings
};
