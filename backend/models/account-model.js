const { query } = require("../config/database");

async function findById(accountId) {
  const result = await query(
    `SELECT id, role, admin_role, full_name, email, phone, username, national_id, status, verification_status,
            permissions, profile, last_login_at, created_at, updated_at
     FROM accounts
     WHERE id = $1`,
    [accountId]
  );
  return result.rows[0] || null;
}

async function findAuthRecordByIdentifier({ email, phone, username }) {
  const values = [email || null, phone || null, username || null];
  const result = await query(
    `SELECT *
     FROM accounts
     WHERE ($1::text IS NOT NULL AND email = $1)
        OR ($2::text IS NOT NULL AND phone = $2)
        OR ($3::text IS NOT NULL AND username = $3)
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

async function listAdmins() {
  const result = await query(
    `SELECT id, role, admin_role, full_name, email, phone, username, status, verification_status, permissions, last_login_at, created_at
     FROM accounts
     WHERE role IN ('admin', 'super_admin')
     ORDER BY created_at DESC`
  );
  return result.rows;
}

async function listUsers() {
  const result = await query(
    `SELECT id, role, full_name, email, phone, national_id, status, verification_status, profile, last_login_at, created_at
     FROM accounts
     WHERE role = 'user'
     ORDER BY created_at DESC`
  );
  return result.rows;
}

module.exports = {
  findById,
  findAuthRecordByIdentifier,
  listAdmins,
  listUsers
};
