const { query } = require("../config/database");
const { getNotificationByIdForAccount } = require("../models/notification-model");
const { emitToAccount, emitToRole } = require("./socket-bus");
const { getAudienceRolesForAccount } = require("../utils/admin-roles");

async function createNotification({
  client = null,
  recipientAccountId = null,
  audienceRole = null,
  title,
  message,
  level = "info",
  eventType,
  payload = {}
}) {
  const executor = client || { query };
  const result = await executor.query(
    `INSERT INTO notifications (recipient_account_id, audience_role, title, message, level, event_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [recipientAccountId, audienceRole, title, message, level, eventType, JSON.stringify(payload)]
  );

  const notification = result.rows[0];
  if (recipientAccountId) {
    emitToAccount(recipientAccountId, "notification:new", notification);
  }
  if (audienceRole) {
    emitToRole(audienceRole, "notification:new", notification);
  }

  return notification;
}

function normalizeReadAccount(accountOrId, roleOrAccount) {
  if (typeof accountOrId === "string") {
    const account = typeof roleOrAccount === "string"
      ? { role: roleOrAccount }
      : (roleOrAccount || {});
    return {
      ...account,
      id: accountOrId
    };
  }

  return {
    ...(accountOrId || {}),
    id: accountOrId?.id || accountOrId?.accountId || null
  };
}

async function markNotificationRead(notificationId, accountOrId, roleOrAccount) {
  const account = normalizeReadAccount(accountOrId, roleOrAccount);
  if (!account.id) {
    return null;
  }

  const audiences = getAudienceRolesForAccount(account);
  const result = await query(
    `SELECT id, recipient_account_id, audience_role
     FROM notifications
     WHERE id = $1
       AND (
         recipient_account_id = $2
         OR (recipient_account_id IS NULL AND audience_role = ANY($3::text[]))
       )
     LIMIT 1`,
    [notificationId, account.id, audiences.length ? audiences : [account.role || "user"]]
  );
  const notification = result.rows[0];
  if (!notification) {
    return null;
  }

  if (notification.recipient_account_id === account.id) {
    await query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND recipient_account_id = $2`,
      [notificationId, account.id]
    );
  } else {
    await query(
      `INSERT INTO notification_reads (notification_id, account_id, read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (notification_id, account_id)
       DO UPDATE SET read_at = COALESCE(notification_reads.read_at, EXCLUDED.read_at)`,
      [notificationId, account.id]
    );
  }

  return getNotificationByIdForAccount(notificationId, account.id, account);
}

module.exports = {
  createNotification,
  markNotificationRead
};
