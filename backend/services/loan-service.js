const { query, withTransaction } = require("../config/database");
const { generateApplicationCode, hashValue } = require("../utils/crypto");
const { AppError } = require("../utils/errors");
const { normalizeEmail, normalizePhone, positiveAmount, requiredText, sanitizeNullableString } = require("../utils/validators");
const { getDeviceFingerprint, getIpAddress } = require("../utils/http");
const { createNotification } = require("./notification-service");
const { emitToAccount, emitToRole } = require("./socket-bus");
const { logAuditEvent } = require("./audit-service");
const { CAPABILITIES, hasAdminCapability } = require("../utils/admin-roles");

const PROCESSING_LOAN_STATUSES = new Set(["submitted", "under_review", "verification"]);
const EXISTING_LOAN_STATUSES = new Set(["approved", "disbursed"]);
const REAPPLICATION_COOLDOWN_DAYS = 7;
const AWAITING_DOCUMENTS_NOTE = "Awaiting additional borrower documents.";
const eligibilityDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC"
});
const DEFAULT_INTEREST_RATE = 17;

function addDays(dateValue, days) {
  const date = new Date(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function formatEligibilityDate(dateValue) {
  return eligibilityDateFormatter.format(new Date(dateValue));
}

function describeLoanApplicationBlock(loans = []) {
  const processingLoan = loans.find((loan) => PROCESSING_LOAN_STATUSES.has(loan.status));
  if (processingLoan) {
    return {
      statusCode: 409,
      message: processingLoan.application_code
        ? `Loan ${processingLoan.application_code} is still being processed.`
        : "You already have a loan request being processed."
    };
  }

  const existingLoan = loans.find((loan) => EXISTING_LOAN_STATUSES.has(loan.status));
  if (existingLoan) {
    return {
      statusCode: 409,
      message: existingLoan.application_code
        ? `Loan ${existingLoan.application_code} is still active. Complete it before applying again.`
        : "You already have an active loan. Complete it before applying again."
    };
  }

  const latestRejectedLoan = loans.find((loan) => loan.status === "rejected");
  if (!latestRejectedLoan) {
    return null;
  }

  const rejectedAt = latestRejectedLoan.closed_at || latestRejectedLoan.updated_at || latestRejectedLoan.submitted_at;
  if (!rejectedAt) {
    return null;
  }

  const eligibleAt = addDays(rejectedAt, REAPPLICATION_COOLDOWN_DAYS);
  if (eligibleAt > new Date()) {
    return {
      statusCode: 409,
      message: latestRejectedLoan.application_code
        ? `Loan ${latestRejectedLoan.application_code} was rejected. You can apply again on ${formatEligibilityDate(eligibleAt)}.`
        : `Your last loan request was rejected. You can apply again on ${formatEligibilityDate(eligibleAt)}.`
    };
  }

  return null;
}

async function assertLoanApplicationAllowed(client, userId) {
  const accountResult = await client.query(
    `SELECT status
     FROM accounts
     WHERE id = $1
     FOR UPDATE`,
    [userId]
  );
  const account = accountResult.rows[0];
  if (!account) {
    throw new AppError(404, "Account not found.");
  }
  if (account.status === "suspended") {
    throw new AppError(403, "Your account is suspended. Contact support to restore loan access.");
  }
  if (account.status !== "active") {
    throw new AppError(403, "Your account is not active. Contact support.");
  }

  const existingLoansResult = await client.query(
    `SELECT application_code, status, submitted_at, updated_at, closed_at
     FROM loan_applications
     WHERE user_id = $1
     ORDER BY submitted_at DESC
     FOR UPDATE`,
    [userId]
  );

  const block = describeLoanApplicationBlock(existingLoansResult.rows);
  if (block) {
    throw new AppError(block.statusCode, block.message);
  }
}

async function resolveLoanApplicationConflict(userId) {
  const existingLoansResult = await query(
    `SELECT application_code, status, submitted_at, updated_at, closed_at
     FROM loan_applications
     WHERE user_id = $1
     ORDER BY submitted_at DESC`,
    [userId]
  );
  const block = describeLoanApplicationBlock(existingLoansResult.rows);
  return block ? new AppError(block.statusCode, block.message) : new AppError(409, "A conflicting loan request already exists for this account.");
}

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

async function assertUniqueBorrowerIdentityData(client, { userId, nationalId, phone, email }) {
  if (nationalId) {
    const nationalIdMatch = await client.query(
      `SELECT full_name
       FROM accounts
       WHERE national_id = $1 AND id <> $2
       LIMIT 1`,
      [nationalId, userId]
    );
    if (nationalIdMatch.rowCount > 0) {
      throw new AppError(409, `National ID / passport is already linked to ${nationalIdMatch.rows[0].full_name || "another account"}.`);
    }
  }

  if (email) {
    const emailMatch = await client.query(
      `SELECT full_name
       FROM accounts
       WHERE email = $1 AND id <> $2
       LIMIT 1`,
      [email, userId]
    );
    if (emailMatch.rowCount > 0) {
      throw new AppError(409, `Email address is already linked to ${emailMatch.rows[0].full_name || "another account"}.`);
    }
  }

  if (phone) {
    const phoneMatch = await client.query(
      `SELECT full_name
       FROM accounts
       WHERE phone = $1 AND id <> $2
       LIMIT 1`,
      [phone, userId]
    );
    if (phoneMatch.rowCount > 0) {
      throw new AppError(409, `Phone number is already linked to ${phoneMatch.rows[0].full_name || "another account"}.`);
    }
  }
}

async function getDefaultInterestRate(client) {
  const result = await client.query(
    `SELECT value
     FROM app_settings
     WHERE key = 'defaultInterestRate'
     LIMIT 1`
  );

  const rawValue = result.rows[0]?.value;
  const numericValue = Number(typeof rawValue === "object" && rawValue !== null ? rawValue : rawValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return DEFAULT_INTEREST_RATE;
  }

  return numericValue;
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

  try {
    const submissionResult = await withTransaction(async (client) => {
      await assertLoanApplicationAllowed(client, user.id);
      await assertUniqueBorrowerIdentityData(client, { userId: user.id, nationalId, phone, email });
      const interestRate = await getDefaultInterestRate(client);

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
            parish: body.parish || null,
            village: body.village || null
          })
        ]
      );

      const result = await client.query(
        `INSERT INTO loan_applications
          (application_code, user_id, amount, term_months, purpose, applicant_category, monthly_income, other_monthly_income,
           existing_obligations, employment_details, address_details, interest_rate, duplicate_risk_score, duplicate_risk_flags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
            parish: sanitizeNullableString(body.parish),
            village: sanitizeNullableString(body.village),
            dateOfBirth: body.dateOfBirth || null
          }),
          interestRate,
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

      return {
        loan,
        duplicateRisk
      };
    });

    const { loan, duplicateRisk: resolvedDuplicateRisk } = submissionResult;
    const borrowerName = user.full_name || body.fullName || "A borrower";

    try {
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
        message: `${borrowerName} submitted ${loan.application_code} for review.`,
        level: "info",
        eventType: "loan.submitted",
        payload: { loanId: loan.id, applicationCode: loan.application_code, userId: user.id }
      });
      await createNotification({
        audienceRole: "super_admin",
        title: "New loan application",
        message: `${borrowerName} submitted ${loan.application_code}.`,
        level: "info",
        eventType: "loan.submitted",
        payload: { loanId: loan.id, applicationCode: loan.application_code, userId: user.id }
      });
      await logAuditEvent({
        actorAccountId: user.id,
        actorRole: user.role,
        action: "loan.submitted",
        entityType: "loan_application",
        entityId: loan.id,
        ipAddress: getIpAddress(req),
        metadata: { applicationCode: loan.application_code, duplicateRisk: resolvedDuplicateRisk }
      });
    } catch (sideEffectError) {
      console.error("Loan submission side effect failed", sideEffectError);
    }

    emitToRole("admin", "loan:created", loan);
    emitToRole("super_admin", "loan:created", loan);
    emitToAccount(user.id, "loan:updated", loan);

    return loan;
  } catch (error) {
    if (error.code === "23505" && error.constraint === "idx_single_active_loan_request") {
      throw await resolveLoanApplicationConflict(user.id);
    }
    throw error;
  }
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

    const normalizedNotes = typeof notes === "string" ? notes.trim() : "";
    const shouldClearReviewNotes = ["approved", "rejected", "closed"].includes(nextStatus);
    const nextReviewNotes = shouldClearReviewNotes ? null : (normalizedNotes || loan.review_notes || null);

    const updatedResult = await client.query(
      `UPDATE loan_applications
       SET status = $2, review_notes = $3, assigned_admin_id = $4,
           updated_at = NOW(), closed_at = CASE WHEN $2 IN ('rejected', 'closed') THEN NOW() ELSE closed_at END
       WHERE id = $1
       RETURNING *`,
      [loanId, nextStatus, nextReviewNotes, actor.role === "admin" ? actor.id : loan.assigned_admin_id]
    );
    const updated = updatedResult.rows[0];
    let verifiedAccount = null;

    await client.query(
      `INSERT INTO loan_status_history (loan_application_id, changed_by_account_id, from_status, to_status, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [loanId, actor.id, loan.status, nextStatus, notes || null]
    );

    if (nextStatus === "approved") {
      const verifiedAccountResult = await client.query(
        `UPDATE accounts
         SET verification_status = 'verified', updated_at = NOW()
         WHERE id = $1
         RETURNING id, role, admin_role, full_name, email, phone, username, national_id, status, verification_status, permissions, profile, last_login_at, created_at, updated_at`,
        [loan.user_id]
      );
      verifiedAccount = verifiedAccountResult.rows[0] || null;
    }

    await createNotification({
      client,
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

    if (verifiedAccount) {
      emitToAccount(loan.user_id, "user:updated", verifiedAccount);
      emitToRole("admin", "user:updated", verifiedAccount);
      emitToRole("super_admin", "user:updated", verifiedAccount);
    }

    await logAuditEvent({
      client,
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
  AWAITING_DOCUMENTS_NOTE,
  submitLoanApplication,
  updateLoanStatus
};
