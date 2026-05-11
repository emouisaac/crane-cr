const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const controller = require("../controllers/admin-controller");
const { requireAuth, requireRoles } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireRoles("admin", "super_admin"));

router.get("/dashboard", asyncHandler(controller.dashboard));
router.get("/applications", asyncHandler(controller.applications));
router.get("/applications/:loanId", asyncHandler(controller.application));
router.patch("/applications/:loanId/status", asyncHandler(controller.reviewLoan));
router.patch("/documents/:documentId", asyncHandler(controller.verifyDocument));
router.get("/documents/:documentId/file", asyncHandler(controller.downloadDocument));
router.get("/users", asyncHandler(controller.users));
router.post("/applications/:loanId/request-documents", asyncHandler(controller.requestDocuments));
router.post("/applications/:loanId/comments", asyncHandler(controller.addInternalComment));

module.exports = router;
