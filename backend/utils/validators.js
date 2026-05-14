const validator = require("validator");
const { AppError } = require("./errors");

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeNullableString(value) {
  const cleaned = cleanString(value);
  return cleaned ? validator.escape(cleaned) : null;
}

function normalizeEmail(value) {
  const cleaned = cleanString(value).toLowerCase();
  if (!cleaned) {
    return null;
  }
  if (!validator.isEmail(cleaned)) {
    throw new AppError(400, "A valid email address is required.");
  }
  return cleaned;
}

function extractUgandaSubscriberDigits(value) {
  const digits = cleanString(value).replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  if (digits.length === 9) {
    return digits;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  if (digits.length === 12 && digits.startsWith("256")) {
    return digits.slice(3);
  }
  if (digits.length > 12 && (digits.startsWith("256") || digits.startsWith("0"))) {
    return digits.slice(-9);
  }

  return "";
}

function normalizePhone(value) {
  const cleaned = cleanString(value);
  if (!cleaned) {
    return null;
  }

  const ugandaSubscriberDigits = extractUgandaSubscriberDigits(cleaned);
  if (ugandaSubscriberDigits) {
    const normalizedUgandaPhone = `+256${ugandaSubscriberDigits}`;
    if (!validator.isMobilePhone(normalizedUgandaPhone, "en-UG", { strictMode: true })) {
      throw new AppError(400, "A valid phone number is required.");
    }
    return normalizedUgandaPhone;
  }

  const digits = cleaned.replace(/[^\d+]/g, "");
  if (!digits) {
    return null;
  }

  let normalized = digits;
  if (!normalized.startsWith("+")) {
    normalized = `+${normalized}`;
  }
  if (!validator.isMobilePhone(normalized, "any", { strictMode: true })) {
    throw new AppError(400, "A valid phone number is required.");
  }
  return normalized;
}

function validatePin(value) {
  const pin = cleanString(value);
  if (!/^\d{6}$/.test(pin)) {
    throw new AppError(400, "PIN must be exactly 6 digits.");
  }
  return pin;
}

function validatePassword(value) {
  const password = cleanString(value);
  if (password.length < 12) {
    throw new AppError(400, "Password must be at least 12 characters.");
  }
  return password;
}

function positiveAmount(value, fieldName = "Amount") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, `${fieldName} must be a positive number.`);
  }
  return amount;
}

function requiredText(value, fieldName) {
  const cleaned = sanitizeNullableString(value);
  if (!cleaned) {
    throw new AppError(400, `${fieldName} is required.`);
  }
  return cleaned;
}

module.exports = {
  cleanString,
  extractUgandaSubscriberDigits,
  sanitizeNullableString,
  normalizeEmail,
  normalizePhone,
  validatePin,
  validatePassword,
  positiveAmount,
  requiredText
};
