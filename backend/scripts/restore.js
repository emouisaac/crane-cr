const { pool } = require("../config/database");
const { restoreBackup } = require("../services/backup-service");

async function run() {
  const fileName = process.argv[2];
  if (!fileName) {
    throw new Error("Usage: npm run restore -- <backup-file-name>");
  }

  await restoreBackup(fileName, { id: null, role: "system" });
  console.log(`Backup restored: ${fileName}`);
  await pool.end();
}

run().catch((error) => {
  console.error("Restore failed", error);
  process.exitCode = 1;
});
