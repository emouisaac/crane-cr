const { query } = require("../config/database");

async function getUserLoans(userId) {
  const result = await query(
    `SELECT *
     FROM loan_applications
     WHERE user_id = $1
     ORDER BY submitted_at DESC`,
    [userId]
  );
  return result.rows;
}

async function getLoanById(loanId) {
  const result = await query(
    `SELECT l.*, a.full_name AS user_name, a.email AS user_email, a.phone AS user_phone, a.national_id AS user_national_id
     FROM loan_applications l
     JOIN accounts a ON a.id = l.user_id
     WHERE l.id = $1`,
    [loanId]
  );
  return result.rows[0] || null;
}

async function getAllLoans() {
  const result = await query(
    `SELECT l.*, a.full_name AS user_name, a.email AS user_email, a.phone AS user_phone, a.national_id AS user_national_id
     FROM loan_applications l
     JOIN accounts a ON a.id = l.user_id
     ORDER BY l.submitted_at DESC`
  );
  return result.rows;
}

module.exports = {
  getUserLoans,
  getLoanById,
  getAllLoans
};
