const { query } = require("../config/database");

async function getDocumentsForLoan(loanApplicationId) {
  const result = await query(
    `SELECT *
     FROM documents
     WHERE loan_application_id = $1
     ORDER BY uploaded_at DESC`,
    [loanApplicationId]
  );
  return result.rows;
}

module.exports = {
  getDocumentsForLoan
};
