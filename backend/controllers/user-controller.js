const { query } = require("../config/database");
const fs = require("fs");
const { getUserLoans } = require("../models/loan-model");
const { getDocumentsForLoan } = require("../models/document-model");
const { getNotificationsForAccount } = require("../models/notification-model");
const { processAndStoreDocument } = require("../services/document-service");
const { AWAITING_DOCUMENTS_NOTE, submitLoanApplication } = require("../services/loan-service");
const { createNotification, markNotificationRead } = require("../services/notification-service");
const { emitToRole } = require("../services/socket-bus");
const { logAuditEvent } = require("../services/audit-service");
const { getIpAddress } = require("../utils/http");
const { AppError } = require("../utils/errors");

async function dashboard(req, res) {
  const loans = await getUserLoans(req.auth.id);
  const notifications = await getNotificationsForAccount(req.auth.id, req.auth.role);
  res.json({
    profile: req.auth,
    loans,
    notifications,
    summary: {
      activeLoans: loans.filter((loan) => ["submitted", "under_review", "verification", "approved", "disbursed"].includes(loan.status)).length,
      outstandingBalance: loans
        .filter((loan) => ["approved", "disbursed"].includes(loan.status))
        .reduce((sum, loan) => {
          const amount = Number(loan.amount || 0);
          const interestRate = Number(loan.interest_rate || 0);
          return sum + amount + (amount * interestRate) / 100;
        }, 0),
      unreadNotifications: notifications.filter((item) => !item.read_at).length
    }
  });
}

async function updateProfile(req, res) {
  const profilePatch = {
    ...req.auth.profile,
    ...req.body
  };
  const result = await query(
    `UPDATE accounts
     SET full_name = COALESCE($2, full_name),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         profile = $5,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, role, full_name, email, phone, username, national_id, status, verification_status, permissions, profile, last_login_at, created_at, updated_at`,
    [req.auth.id, req.body.fullName || null, req.body.email || null, req.body.phone || null, JSON.stringify(profilePatch)]
  );

  emitToRole("admin", "user:updated", result.rows[0]);
  res.json({ profile: result.rows[0] });
}

async function applyLoan(req, res) {
  const loan = await submitLoanApplication({ user: req.auth, body: req.body, req });
  res.status(201).json({ loan });
}

async function uploadDocument(req, res) {
  if (!req.file) {
    throw new AppError(400, "Document image is required.");
  }

  const loanResult = await query(
    `SELECT * FROM loan_applications WHERE id = $1 AND user_id = $2`,
    [req.params.loanId, req.auth.id]
  );
  const loan = loanResult.rows[0];
  if (!loan) {
    return res.status(404).json({ error: "Loan application not found." });
  }

  const document = await processAndStoreDocument({
    file: req.file,
    userId: req.auth.id,
    loanApplicationId: loan.id,
    documentType: req.body.documentType
  });

  let refreshedLoan = loan;
  if (loan.review_notes === AWAITING_DOCUMENTS_NOTE) {
    const resetLoanResult = await query(
      `UPDATE loan_applications
       SET review_notes = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [loan.id]
    );
    refreshedLoan = resetLoanResult.rows[0] || loan;
    emitToRole("admin", "loan:updated", refreshedLoan);
    emitToRole("super_admin", "loan:updated", refreshedLoan);
  }

  await createNotification({
    audienceRole: "admin",
    title: "New verification document uploaded",
    message: `${req.auth.full_name} uploaded ${req.body.documentType} for ${loan.application_code}.`,
    eventType: "document.uploaded",
    payload: { loanId: loan.id, documentId: document.id, applicationCode: loan.application_code, documentType: req.body.documentType }
  });

  await createNotification({
    audienceRole: "super_admin",
    title: "New verification document uploaded",
    message: `${req.auth.full_name} uploaded ${req.body.documentType} for ${loan.application_code}.`,
    eventType: "document.uploaded",
    payload: { loanId: loan.id, documentId: document.id, applicationCode: loan.application_code, documentType: req.body.documentType }
  });

  emitToRole("admin", "document:updated", document);
  emitToRole("super_admin", "document:updated", document);

  await logAuditEvent({
    actorAccountId: req.auth.id,
    actorRole: req.auth.role,
    action: "document.uploaded",
    entityType: "document",
    entityId: document.id,
    ipAddress: getIpAddress(req),
    metadata: { loanId: loan.id, documentType: req.body.documentType }
  });

  res.status(201).json({ document });
}

async function loanDocuments(req, res) {
  const docs = await getDocumentsForLoan(req.params.loanId);
  res.json({ documents: docs });
}

async function downloadDocument(req, res) {
  const result = await query(
    `SELECT * FROM documents WHERE id = $1 AND user_id = $2`,
    [req.params.documentId, req.auth.id]
  );
  const document = result.rows[0];
  if (!document || !fs.existsSync(document.file_path)) {
    return res.status(404).json({ error: "Document file not found." });
  }
  return res.sendFile(document.file_path);
}

async function notifications(req, res) {
  const items = await getNotificationsForAccount(req.auth.id, req.auth.role);
  res.json({ notifications: items });
}

async function readNotification(req, res) {
  const item = await markNotificationRead(req.params.notificationId, req.auth);
  res.json({ notification: item });
}

async function addComment(req, res) {
  const result = await query(
    `INSERT INTO application_comments (loan_application_id, author_account_id, visibility, message)
     VALUES ($1, $2, 'user_visible', $3)
     RETURNING *`,
    [req.params.loanId, req.auth.id, req.body.message]
  );
  await createNotification({
    audienceRole: "admin",
    title: "Borrower comment received",
    message: `${req.auth.full_name} responded on loan ${req.params.loanId}.`,
    eventType: "loan.comment_added",
    payload: { loanId: req.params.loanId, commentId: result.rows[0].id }
  });
  res.status(201).json({ comment: result.rows[0] });
}

module.exports = {
  addComment,
  applyLoan,
  dashboard,
  downloadDocument,
  loanDocuments,
  notifications,
  readNotification,
  updateProfile,
  uploadDocument
};
