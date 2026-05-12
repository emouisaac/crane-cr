const { getAudienceRolesForAccount } = require("../utils/admin-roles");
const { query } = require("../config/database");

async function getNotificationsForAccount(accountId, roleOrAccount) {
  const account = typeof roleOrAccount === "string"
    ? { role: roleOrAccount }
    : (roleOrAccount || {});
  const audiences = getAudienceRolesForAccount(account);
  const result = await query(
    `SELECT *
     FROM notifications
     WHERE recipient_account_id = $1
        OR (recipient_account_id IS NULL AND audience_role = ANY($2::text[]))
     ORDER BY created_at DESC
     LIMIT 100`,
    [accountId, audiences.length ? audiences : [account.role || "user"]]
  );
  return result.rows;
}

module.exports = {
  getNotificationsForAccount
};
