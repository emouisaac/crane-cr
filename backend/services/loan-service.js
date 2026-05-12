const { query, withTransaction } = require("../config/database");
const { generateApplicationCode, hashValue } = require("../utils/crypto");
const { AppError } = require("../utils/errors");
const { normalizeEmail, normalizePhone, positiveAmount, requiredText, sanitizeNullableString } = require("../utils/validators");
const { getDeviceFingerprint, getIpAddress } = require("../utils/http");
const { createNotification } = require("./notification-service");
const { emitToAccount, emitToRole } = require("./socket-bus");
const { logAuditEvent } = require("./audit-service");
const { CAPABILITIES, hasAdminCapability } = require("../utils/admin-roles");

async function detectDuplicateRisk({ userId, nationalId, phone, email, req }) {
  const flags = [];
  const fingerprintHash = hashValue(getDeviceFingerprint(req));
  const ipAddress = getIpAddress(req);

  if (nationalId) {
    const nationalMatch = await query(
      `SELECT id, full_name FROM accounts WHERE national_id = $1 AND id <> $2 LIMIT 1`,
      [nationalId, userId]
    );
    if (nationalMatch.rowCount > 0) {
      flags.push(`National ID already linked to ${nationalMatch.rows[0].full_name}`);
    }
  }

  const deviceMatch = await query(
    `SELECT account_id FROM account_devices WHERE fingerprint_hash = $1 AND account_id <> $2 LIMIT 1`,
    [fingerprintHash, userId]
  );
  if (deviceMatch.rowCount > 0) {
    flags.push("Device fingerprint already linked to another account");
  }

  const ipMatch = await query(
    `SELECT COUNT(DISTINCT account_id)::int AS count
     FROM account_devices
     WHERE last_ip_address = $1 AND account_id <> $2`,
    [ipAddress, userId]
  );
  if ((ipMatch.rows[0]?.count || 0) >= 2) {
    flags.push("IP address has activity across multiple accounts");
  }

  if (email) {
    const emailMatch = await query(
      `SELECT id FROM accounts WHERE email = $1 AND id <> $2 LIMIT 1`,
      [email, userId]
    );
    if (emailMatch.rowCount > 0) {
      flags.push("Email already linked to another account");
    }
  }

  if (phone) {
    const phoneMatch = await query(
      `SELECT id FROM accounts WHERE phone = $1 AND id <> $2 LIMIT 1`,
      [phone, userId]
    );
    if (phoneMatch.rowCount > 0) {
      flags.push("Phone already linked to another account");
    }
  }

  return {
    score: Math.min(flags.length * 25, 100),
    flags
  };
}

async function submitLoanApplication({ user, body, req }) {
  const amount = positiveAmount(body.amount, "Loan amount");
  const termMonths = Number.parseInt(body.termMonths, 10);
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new AppError(400, "Preferred term is required.");
  }

  const email = normalizeEmail(body.email || user.email);
  const phone = normalizePhone(body.phone || user.phone);
  const nationalId = requiredText(body.nationalId, "National ID / passport number");
  const duplicateRisk = await detectDuplicateRisk({ userId: user.id, nationalId, phone, email, req });

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE accounts
       SET full_name = $2, email = COALESCE($3, email), phone = COALESCE($4, phone), national_id = $5,
           profile = profile || $6::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [
        user.id,
        requiredText(body.fullName || user.full_name, "Full name"),
        email,
        phone,
        nationalId,
        JSON.stringify({
          dateOfBirth: body.dateOfBirth || null,
          district: body.district || null,
          subcounty: body.subcounty || null,
          village: body.village || null
        })
      ]
    );

    const result = await client.query(
      `INSERT INTO loan_applications
        (application_code, user_id, amount, term_months, purpose, applicant_category, monthly_income, other_monthly_income,
         existing_obligations, employment_details, address_details, duplicate_risk_score, duplicate_risk_flags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        generateApplicationCode(),
        user.id,
        amount,
        termMonths,
        requiredText(body.loanPurpose, "Loan purpose"),
        requiredText(body.applicantCategory, "Applicant category"),
        body.monthlyIncome ? positiveAmount(body.monthlyIncome, "Monthly income") : null,
        body.otherMonthlyIncome ? positiveAmount(body.otherMonthlyIncome, "Other monthly income") : null,
        sanitizeNullableString(body.existingObligations),
        JSON.stringify({
          employerName: sanitizeNullableString(body.employerName),
          positionGrade: sanitizeNullableString(body.positionGrade),
          lengthOfService: sanitizeNullableString(body.lengthOfService),
          businessName: sanitizeNullableString(body.businessName),
          businessCategory: sanitizeNullableString(body.businessCategory),
          businessRegistrationNumber: sanitizeNullableString(body.businessRegistrationNumber)
        }),
        JSON.stringify({
          district: sanitizeNullableString(body.district),
          subcounty: sanitizeNullableString(body.subcounty),
          village: sanitizeNullableString(body.village),
          dateOfBirth: body.dateOfBirth || null
        }),
        duplicateRisk.score,
        JSON.stringify(duplicateRisk.flags)
      ]
    );

    const loan = result.rows[0];
    await client.query(
      `INSERT INTO loan_status_history (loan_application_id, changed_by_account_id, from_status, to_status, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [loan.id, user.id, null, "submitted", "Application submitted by borrower"]
    );

    await createNotification({
      recipientAccountId: user.id,
      title: "Loan application submitted",
      message: `Your request ${loan.application_code} has been received and is awaiting review.`,
      level: "success",
      eventType: "loan.submitted",
      payload: { loanId: loan.id, applicationCode: loan.application_code }
    });
    await createNotification({
      audienceRole: "admin",
      title: "New loan application",
      message: `${user.full_name} submitted ${loan.application_code} for review.`,
      level: "info",
      eventType: "loan.submitted",
      payload: { loanId: loan.id, applicationCode: loan.application_code, userId: user.id }
    });
    await createNotification({
      audienceRole: "super_admin",
      title: "New loan application",
      message: `${user.full_name} submitted ${loan.application_code}.`,
      level: "info",
      eventType: "loan.submitted",
      payload: { loanId: loan.id, applicationCode: loan.application_code, userId: user.id }
    });

    emitToRole("admin", "loan:created", loan);
    emitToRole("super_admin", "loan:created", loan);
    emitToAccount(user.id, "loan:updated", loan);

    await logAuditEvent({
      actorAccountId: user.id,
      actorRole: user.role,
      action: "loan.submitted",
      entityType: "loan_application",
      entityId: loan.id,
      ipAddress: getIpAddress(req),
      metadata: { applicationCode: loan.application_code, duplicateRisk }
    });

    return loan;
  }).catch((error) => {
    if (error.code === "23505") {
      throw new AppError(409, "You already have an active loan request being processed.");
    }
    throw error;
  });
}

async function updateLoanStatus({ actor, loanId, nextStatus, notes, req }) {
  const allowedStatuses = new Set(["submitted", "under_review", "verification", "approved", "disbursed", "rejected", "closed"]);
  if (!allowedStatuses.has(nextStatus)) {
    throw new AppError(400, "Invalid loan status.");
  }
  if (nextStatus === "approved" && !hasAdminCapability(actor, CAPABILITIES.LOANS_APPROVE)) {
    throw new AppError(403, "Only a super admin can approve loans.");
  }

  return withTransaction(async (client) => {
    const currentResult = await client.query("SELECT * FROM loan_applications WHERE id = $1 FOR UPDATE", [loanId]);
    const loan = currentResult.rows[0];
    if (!loan) {
      throw new AppError(404, "Loan application not found.");
    }

    const updatedResult = await client.query(
      `UPDATE loan_applications
       SET status = $2, review_notes = COALESCE($3, review_notes), assigned_admin_id = $4,
           updated_at = NOW(), closed_at = CASE WHEN $2 IN ('rejected', 'closed') THEN NOW() ELSE closed_at END
       WHERE id = $1
       RETURNING *`,
      [loanId, nextStatus, notes || null, actor.role === "admin" ? actor.id : loan.assigned_admin_id]
    );
    const updated = updatedResult.rows[0];

    await client.query(
      `INSERT INTO loan_status_history (loan_application_id, changed_by_account_id, from_status, to_status, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [loanId, actor.id, loan.status, nextStatus, notes || null]
    );

    await createNotification({
      recipientAccountId: loan.user_id,
      title: "Loan status updated",
      message: `Your application ${loan.application_code} is now ${nextStatus.replace(/_/g, " ")}.`,
      level: nextStatus === "rejected" ? "warning" : "info",
      eventType: "loan.status_changed",
      payload: { loanId, status: nextStatus, notes: notes || null }
    });

    emitToAccount(loan.user_id, "loan:updated", updated);
    emitToRole("super_admin", "loan:updated", updated);
    emitToRole("admin", "loan:updated", updated);

    await logAuditEvent({
      actorAccountId: actor.id,
      actorRole: actor.role,
      action: "loan.status_changed",
      entityType: "loan_application",
      entityId: loanId,
      ipAddress: getIpAddress(req),
      metadata: { fromStatus: loan.status, toStatus: nextStatus, notes: notes || null }
    });

    return updated;
  });
}

module.exports = {
  submitLoanApplication,
  updateLoanStatus
};
