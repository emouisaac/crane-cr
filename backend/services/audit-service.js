const { query } = require("../config/database");

async function logAuditEvent({
  client = null,
  actorAccountId = null,
  actorRole = null,
  action,
  entityType,
  entityId = null,
  ipAddress = null,
  metadata = {}
}) {
  const executor = client || { query };
  await executor.query(
    `INSERT INTO audit_logs (actor_account_id, actor_role, action, entity_type, entity_id, ip_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actorAccountId, actorRole, action, entityType, entityId, ipAddress, JSON.stringify(metadata)]
  );
}

module.exports = {
  logAuditEvent
};
