const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const controller = require("../controllers/super-admin-controller");
const { requireAuth, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireRoles("super_admin"));

router.get("/dashboard", asyncHandler(controller.dashboard));
router.get("/admins", asyncHandler(controller.admins));
router.post("/admins", asyncHandler(controller.createAdmin));
router.patch("/accounts/:accountId/status", asyncHandler(controller.setAccountStatus));
router.post("/accounts/:accountId/force-logout", asyncHandler(controller.forceLogout));
router.patch("/accounts/:accountId/permissions", asyncHandler(controller.updatePermissions));
router.get("/audit-logs", asyncHandler(controller.auditLogs));
router.get("/security-alerts", asyncHandler(controller.securityAlerts));
router.get("/backups", asyncHandler(controller.backups));
router.post("/backups", asyncHandler(controller.triggerBackup));
router.post("/backups/restore", asyncHandler(controller.triggerRestore));
router.put("/settings", asyncHandler(controller.updateSettings));

module.exports = router;
