const express = require("express");
const publicRoutes = require("./public-routes");
const authRoutes = require("./auth-routes");
const userRoutes = require("./user-routes");
const adminRoutes = require("./admin-routes");
const superAdminRoutes = require("./super-admin-routes");

const router = express.Router();

router.use("/public", publicRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/admin", adminRoutes);
router.use("/super-admin", superAdminRoutes);

module.exports = router;
