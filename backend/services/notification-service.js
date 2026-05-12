const { query } = require("../config/database");
const { emitToAccount, emitToRole } = require("./socket-bus");

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

async function markNotificationRead(notificationId, accountId) {
  const result = await query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND recipient_account_id = $2
     RETURNING *`,
    [notificationId, accountId]
  );
  return result.rows[0] || null;
}

module.exports = {
  createNotification,
  markNotificationRead
};
