const { pool } = require("../config/database");
const { ensureSuperAdminAccount } = require("../services/auth-service");

async function run() {
  const account = await ensureSuperAdminAccount();
  console.log(`Super admin ready: ${account.username}`);
  await pool.end();
}

run().catch((error) => {
  console.error("Failed to seed super admin", error);
  process.exitCode = 1;
});
