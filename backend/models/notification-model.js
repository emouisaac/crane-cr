const { query } = require("../config/database");

async function getNotificationsForAccount(accountId, role) {
  const result = await query(
    `SELECT *
     FROM notifications
     WHERE recipient_account_id = $1
        OR (recipient_account_id IS NULL AND audience_role = $2)
     ORDER BY created_at DESC
     LIMIT 100`,
    [accountId, role]
  );
  return result.rows;
}

module.exports = {
  getNotificationsForAccount
};
