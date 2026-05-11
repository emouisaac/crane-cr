const fs = require("fs");
const path = require("path");
const { pool, query, withTransaction } = require("../config/database");
const { env } = require("../config/env");
const { AppError } = require("../utils/errors");

const backupTables = [
  "accounts",
  "account_devices",
  "sessions",
  "notifications",
  "loan_applications",
  "loan_status_history",
  "documents",
  "application_comments",
  "audit_logs",
  "security_events",
  "system_backups"
];

function ensureBackupDir() {
  fs.mkdirSync(env.backupRoot, { recursive: true });
}

async function exportTable(tableName) {
  const result = await query(`SELECT * FROM ${tableName}`);
  return result.rows;
}

async function createBackup({ actor = null, backupType = "full" } = {}) {
  ensureBackupDir();
  const payload = {};
  for (const table of backupTables) {
    payload[table] = await exportTable(table);
  }

  const fileName = `crane-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(env.backupRoot, fileName);
  fs.writeFileSync(filePath, JSON.stringify({ generatedAt: new Date().toISOString(), backupType, payload }, null, 2));

  await query(
    `INSERT INTO system_backups (file_name, file_path, backup_type, status, created_by_account_id, metadata)
     VALUES ($1, $2, $3, 'completed', $4, $5)`,
    [fileName, filePath, backupType, actor?.id || null, JSON.stringify({ tables: backupTables.length })]
  );

  return { fileName, filePath };
}

async function restoreBackup(fileName, actor) {
  ensureBackupDir();
  const filePath = path.join(env.backupRoot, fileName);
  if (!fs.existsSync(filePath)) {
    throw new AppError(404, "Backup file not found.");
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const payload = parsed.payload || {};
  const clearOrder = [...backupTables].reverse().filter((table) => table !== "system_backups");
  const insertOrder = backupTables.filter((table) => table !== "system_backups");

  await withTransaction(async (client) => {
    for (const table of clearOrder) {
      await client.query(`TRUNCATE TABLE ${table} CASCADE`);
    }

    for (const table of insertOrder) {
      const rows = payload[table] || [];
      if (!rows.length) {
        continue;
      }
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, columnIndex) => `$${columnIndex + 1}`).join(", ");
      for (const row of rows) {
        const values = columns.map((column) => row[column]);
        await client.query(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
          values
        );
      }
    }

    await client.query(
      `UPDATE system_backups
       SET status = 'restored', restored_at = NOW()
       WHERE file_name = $1`,
      [fileName]
    );
  });

  await query(
    `INSERT INTO audit_logs (actor_account_id, actor_role, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'backup.restored', 'system_backup', $3, $4)`,
    [actor.id, actor.role, fileName, JSON.stringify({ fileName })]
  );
}

async function listBackups() {
  const result = await query(
    `SELECT *
     FROM system_backups
     ORDER BY created_at DESC
     LIMIT 50`
  );
  return result.rows;
}

module.exports = {
  createBackup,
  restoreBackup,
  listBackups
};
