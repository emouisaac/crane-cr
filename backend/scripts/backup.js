const { pool } = require("../config/database");
const { createBackup } = require("../services/backup-service");

async function run() {
  const backup = await createBackup();
  console.log(`Backup created: ${backup.fileName}`);
  await pool.end();
}

run().catch((error) => {
  console.error("Backup failed", error);
  process.exitCode = 1;
});
