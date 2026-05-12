const fs = require("fs");
const { query } = require("../config/database");
const { getAllLoans, getLoanById } = require("../models/loan-model");
const { getDocumentsForLoan } = require("../models/document-model");
const { listUsers } = require("../models/account-model");
const { getNotificationsForAccount } = require("../models/notification-model");
const { updateLoanStatus } = require("../services/loan-service");
const { createNotification } = require("../services/notification-service");
const { emitToAccount, emitToRole } = require("../services/socket-bus");
const { logAuditEvent } = require("../services/audit-service");
const { getIpAddress } = require("../utils/http");
const { AppError } = require("../utils/errors");
const { CAPABILITIES, hasAdminCapability } = require("../utils/admin-roles");

function requireCapability(account, capability) {
  if (!hasAdminCapability(account, capability)) {
    throw new AppError(403, "Your assigned admin role cannot perform this action.");
  }
}

async function dashboard(req, res) {
  requireCapability(req.auth, CAPABILITIES.DASHBOARD_VIEW);
  const [loans, users, notifications] = await Promise.all([
    getAllLoans(),
    listUsers(),
    getNotificationsForAccount(req.auth.id, req.auth)
  ]);

  res.json({
    loans,
    users,
    notifications,
    summary: {
      totalApplications: loans.length,
      pendingReview: loans.filter((loan) => ["submitted", "under_review", "verification"].includes(loan.status)).length,
      approvedToday: loans.filter((loan) => loan.status === "approved").length,
      activeUsers: users.filter((user) => user.status === "active").length
    }
  });
}

async function applications(req, res) {
  requireCapability(req.auth, CAPABILITIES.APPLICATIONS_VIEW);
  const loans = await getAllLoans();
  res.json({ loans });
}

async function application(req, res) {
  if (
    !hasAdminCapability(req.auth, CAPABILITIES.APPLICATIONS_VIEW) &&
    !hasAdminCapability(req.auth, CAPABILITIES.DOCUMENTS_VIEW) &&
    !hasAdminCapability(req.auth, CAPABILITIES.DOCUMENTS_REQUEST) &&
    !hasAdminCapability(req.auth, CAPABILITIES.COMMENTS_ADD)
  ) {
    throw new AppError(403, "Your assigned admin role cannot access application details.");
  }
  const loan = await getLoanById(req.params.loanId);
  if (!loan) {
    return res.status(404).json({ error: "Loan application not found." });
  }
  const documents = await getDocumentsForLoan(req.params.loanId);
  const comments = await query(
    `SELECT c.*, a.full_name AS author_name, a.role AS author_role
     FROM application_comments c
     JOIN accounts a ON a.id = c.author_account_id
     WHERE c.loan_application_id = $1
     ORDER BY c.created_at DESC`,
    [req.params.loanId]
  );
  res.json({ loan, documents, comments: comments.rows });
}

async function reviewLoan(req, res) {
  requireCapability(req.auth, CAPABILITIES.APPLICATIONS_UPDATE);
  const updated = await updateLoanStatus({
    actor: req.auth,
    loanId: req.params.loanId,
    nextStatus: req.body.status,
    notes: req.body.notes,
    req
  });
  res.json({ loan: updated });
}

async function verifyDocument(req, res) {
  requireCapability(req.auth, CAPABILITIES.DOCUMENTS_REVIEW);
  const result = await query(
    `UPDATE documents
     SET status = $2, metadata = metadata || $3::jsonb
     WHERE id = $1
     RETURNING *`,
    [req.params.documentId, req.body.status, JSON.stringify({ reviewNotes: req.body.notes || null, verifiedBy: req.auth.id })]
  );
  const document = result.rows[0];
  if (!document) {
    return res.status(404).json({ error: "Document not found." });
  }

  await createNotification({
    recipientAccountId: document.user_id,
    title: "Document review update",
    message: `Your ${document.document_type.replace(/_/g, " ")} document is now ${req.body.status.replace(/_/g, " ")}.`,
    level: req.body.status === "rejected" ? "warning" : "info",
    eventType: "document.reviewed",
    payload: { documentId: document.id, loanId: document.loan_application_id }
  });

  emitToAccount(document.user_id, "document:updated", document);
  emitToRole("super_admin", "document:updated", document);

  res.json({ document });
}

async function downloadDocument(req, res) {
  const result = await query(`SELECT * FROM documents WHERE id = $1`, [req.params.documentId]);
  const document = result.rows[0];
  if (!document || !fs.existsSync(document.file_path)) {
    return res.status(404).json({ error: "Document file not found." });
  }
  return res.sendFile(document.file_path);
}

async function users(req, res) {
  requireCapability(req.auth, CAPABILITIES.BORROWERS_VIEW);
  const result = await listUsers();
  res.json({ users: result });
}

async function requestDocuments(req, res) {
  requireCapability(req.auth, CAPABILITIES.DOCUMENTS_REQUEST);
  const loan = await getLoanById(req.params.loanId);
  if (!loan) {
    return res.status(404).json({ error: "Loan application not found." });
  }

  await query(
    `INSERT INTO application_comments (loan_application_id, author_account_id, visibility, message)
     VALUES ($1, $2, 'user_visible', $3)`,
    [loan.id, req.auth.id, req.body.message]
  );

  await createNotification({
    recipientAccountId: loan.user_id,
    title: "Additional documents requested",
    message: req.body.message,
    level: "warning",
    eventType: "loan.documents_requested",
    payload: { loanId: loan.id }
  });

  const followUpStatus = req.auth.role === "super_admin" ? "verification" : "under_review";
  await updateLoanStatus({
    actor: req.auth,
    loanId: loan.id,
    nextStatus: followUpStatus,
    notes: "Awaiting additional borrower documents.",
    req
  });

  res.json({ success: true });
}

async function addInternalComment(req, res) {
  requireCapability(req.auth, CAPABILITIES.COMMENTS_ADD);
  const result = await query(
    `INSERT INTO application_comments (loan_application_id, author_account_id, visibility, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [req.params.loanId, req.auth.id, req.body.visibility || "internal", req.body.message]
  );
  await logAuditEvent({
    actorAccountId: req.auth.id,
    actorRole: req.auth.role,
    action: "loan.comment_added",
    entityType: "loan_application",
    entityId: req.params.loanId,
    ipAddress: getIpAddress(req),
    metadata: { visibility: req.body.visibility || "internal" }
  });
  res.status(201).json({ comment: result.rows[0] });
}

module.exports = {
  addInternalComment,
  application,
  applications,
  dashboard,
  downloadDocument,
  requestDocuments,
  reviewLoan,
  users,
  verifyDocument
};
