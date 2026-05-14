const { getAudienceRolesForAccount } = require("../utils/admin-roles");
const { query } = require("../config/database");

function normalizeNotificationAccount(accountId, roleOrAccount) {
  const account = typeof roleOrAccount === "string"
    ? { role: roleOrAccount }
    : (roleOrAccount || {});
  return {
    ...account,
    id: accountId
  };
}

function getNotificationAudiences(account) {
  const audiences = getAudienceRolesForAccount(account);
  return audiences.length ? audiences : [account.role || "user"];
}

const notificationSelect = `
  SELECT
    n.id,
    n.recipient_account_id,
    n.audience_role,
    n.title,
    n.message,
    n.level,
    n.event_type,
    n.payload,
    CASE
      WHEN n.recipient_account_id = $1 THEN n.read_at
      ELSE nr.read_at
    END AS read_at,
    n.created_at
  FROM notifications n
  LEFT JOIN notification_reads nr
    ON nr.notification_id = n.id
   AND nr.account_id = $1
`;

async function getNotificationsForAccount(accountId, roleOrAccount) {
  const account = normalizeNotificationAccount(accountId, roleOrAccount);
  const audiences = getNotificationAudiences(account);
  const result = await query(
    `${notificationSelect}
     WHERE n.recipient_account_id = $1
        OR (n.recipient_account_id IS NULL AND n.audience_role = ANY($2::text[]))
     ORDER BY created_at DESC
     LIMIT 100`,
    [account.id, audiences]
  );
  return result.rows;
}

async function getNotificationByIdForAccount(notificationId, accountId, roleOrAccount) {
  const account = normalizeNotificationAccount(accountId, roleOrAccount);
  const audiences = getNotificationAudiences(account);
  const result = await query(
    `${notificationSelect}
     WHERE n.id = $2
       AND (
         n.recipient_account_id = $1
         OR (n.recipient_account_id IS NULL AND n.audience_role = ANY($3::text[]))
       )
     LIMIT 1`,
    [account.id, notificationId, audiences]
  );
  return result.rows[0] || null;
}

module.exports = {
  getNotificationByIdForAccount,
  getNotificationsForAccount
};
