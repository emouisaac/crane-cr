const { pool } = require("../config/database");

async function clearUserAccounts() {
  try {
    // Delete all user accounts (keeping admin and super_admin)
    const result = await pool.query(`
      DELETE FROM accounts
      WHERE role = 'user'
    `);

    console.log(`Cleared ${result.rowCount} user accounts`);

    // Also clear device records
    await pool.query(`DELETE FROM account_devices`);

    console.log("Cleared device records");

    await pool.end();
  } catch (error) {
    console.error("Failed to clear accounts", error);
    process.exitCode = 1;
  }
}

clearUserAccounts();