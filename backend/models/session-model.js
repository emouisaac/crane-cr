const { query } = require("../config/database");

async function listActiveSessionsByAccount(accountId) {
  const result = await query(
    `SELECT id, user_agent, ip_address, expires_at, last_seen_at, created_at
     FROM sessions
     WHERE account_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY last_seen_at DESC`,
    [accountId]
  );
  return result.rows;
}

module.exports = {
  listActiveSessionsByAccount
};
