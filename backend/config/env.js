const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const rootDir = path.resolve(__dirname, "..", "..");

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value).toLowerCase() === "true";
}

function asInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function requireValue(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function normalizeOrigin(value, fallback) {
  const source = String(value || "").trim();
  if (!source) {
    return fallback;
  }

  try {
    return new URL(source).origin;
  } catch (_error) {
    return fallback;
  }
}

function isIpAddress(hostname) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}

function normalizeCookieDomain(value) {
  const source = String(value || "").trim();
  if (!source) {
    return undefined;
  }

  let hostname = source;
  try {
    hostname = new URL(source.includes("://") ? source : `https://${source}`).hostname;
  } catch (_error) {
    hostname = source.replace(/^\.+/, "").split("/")[0].split(":")[0];
  }

  const normalized = hostname.toLowerCase();
  if (!normalized || normalized === "localhost" || isIpAddress(normalized)) {
    return undefined;
  }

  return normalized;
}

const env = {
  rootDir,
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: (process.env.NODE_ENV || "development") === "production",
  port: asInt(process.env.PORT, 3000),
  appOrigin: normalizeOrigin(process.env.APP_ORIGIN, "http://localhost:3000"),
  databaseUrl: requireValue("DATABASE_URL"),
  databaseSsl: asBool(process.env.DATABASE_SSL, false),
  jwtAccessSecret: requireValue("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: requireValue("JWT_REFRESH_SECRET"),
  accessTokenTtlMinutes: asInt(process.env.ACCESS_TOKEN_TTL_MINUTES, 15),
  refreshTokenTtlDays: asInt(process.env.REFRESH_TOKEN_TTL_DAYS, 7),
  cookieDomain: normalizeCookieDomain(process.env.COOKIE_DOMAIN),
  cookieSecure: asBool(process.env.COOKIE_SECURE, false),
  superAdminUsername: requireValue("SUPER_ADMIN_USERNAME"),
  superAdminPassword: requireValue("SUPER_ADMIN_PASSWORD"),
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || "superadmin@example.com",
  superAdminName: process.env.SUPER_ADMIN_NAME || "Crane Super Admin",
  storageRoot: path.resolve(rootDir, process.env.STORAGE_ROOT || "backend/storage"),
  uploadRoot: path.resolve(rootDir, process.env.UPLOAD_ROOT || "backend/storage/uploads"),
  backupRoot: path.resolve(rootDir, process.env.BACKUP_ROOT || "backend/storage/backups"),
  csrfCookieName: process.env.CSRF_COOKIE_NAME || "crane_csrf",
  autoBackupCron: process.env.AUTO_BACKUP_CRON || "0 2 * * *",
  maxFailedLoginWindowMinutes: asInt(process.env.MAX_FAILED_LOGIN_WINDOW_MINUTES, 15),
  maxFailedLoginAttempts: asInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS, 7)
};

module.exports = { env };
