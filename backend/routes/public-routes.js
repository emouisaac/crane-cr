const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const controller = require("../controllers/public-controller");

const router = express.Router();

router.get("/health", controller.health);
router.get("/bootstrap", asyncHandler(controller.bootstrap));

module.exports = router;
