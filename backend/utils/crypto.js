const crypto = require("crypto");

function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function generateApplicationCode() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const tail = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CRN-${stamp}-${tail}`;
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  randomToken,
  hashValue,
  generateApplicationCode,
  safeJsonParse
};
