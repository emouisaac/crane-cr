const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const controller = require("../controllers/auth-controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/register", asyncHandler(controller.register));
router.post("/login", asyncHandler(controller.login));
router.post("/admin/login", asyncHandler(controller.adminSignIn));
router.post("/super-admin/login", asyncHandler(controller.superAdminSignIn));
router.post("/refresh", asyncHandler(controller.refresh));
router.post("/logout", asyncHandler(controller.logout));
router.get("/session", requireAuth, asyncHandler(controller.session));

module.exports = router;
