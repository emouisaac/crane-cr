const fs = require("fs");
const path = require("path");
const { pool, withTransaction } = require("../config/database");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function runMigrations() {
  await ensureMigrationsTable();

  const migrationsDir = path.resolve(__dirname, "..", "migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

  for (const file of migrationFiles) {
    const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (existing.rowCount > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    });
    console.log(`Applied migration: ${file}`);
  }

}

async function run() {
  await runMigrations();
  await pool.end();
}

if (require.main === module) {
  run().catch((error) => {
    console.error("Migration failed", error);
    process.exitCode = 1;
  });
}

module.exports = {
  runMigrations
};
