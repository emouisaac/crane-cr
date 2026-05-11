const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const controller = require("../controllers/user-controller");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.use(requireAuth, requireRoles("user"));

router.get("/dashboard", asyncHandler(controller.dashboard));
router.put("/me", asyncHandler(controller.updateProfile));
router.post("/loans", asyncHandler(controller.applyLoan));
router.get("/loans/:loanId/documents", asyncHandler(controller.loanDocuments));
router.post("/loans/:loanId/documents", upload.single("document"), asyncHandler(controller.uploadDocument));
router.get("/documents/:documentId/file", asyncHandler(controller.downloadDocument));
router.get("/notifications", asyncHandler(controller.notifications));
router.post("/notifications/:notificationId/read", asyncHandler(controller.readNotification));
router.post("/loans/:loanId/comments", asyncHandler(controller.addComment));

module.exports = router;
