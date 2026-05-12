const fs = require("fs");
const http = require("http");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron");
const { env } = require("./config/env");
const { attachAuth } = require("./middleware/auth");
const { verifyCsrf } = require("./middleware/csrf");
const { errorHandler } = require("./middleware/error-handler");
const apiRoutes = require("./routes");
const { initializeRealtime } = require("./sockets/realtime");
const { runMigrations } = require("./scripts/migrate");
const { ensureSuperAdminAccount } = require("./services/auth-service");
const { createBackup } = require("./services/backup-service");

function ensureStorageDirectories() {
  [env.storageRoot, env.uploadRoot, env.backupRoot].forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
  });
}

function resolveRoleRedirect(req, loginPage, allowedRoles) {
  if (!req.auth) {
    return loginPage;
  }
  if (allowedRoles.includes(req.auth.role)) {
    return null;
  }
  if (req.auth.role === "super_admin") {
    return "/super-admin.html";
  }
  if (req.auth.role === "admin") {
    return "/admin.html";
  }
  return loginPage;
}

function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", env.appOrigin],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"]
        }
      }
    })
  );
  app.use(
    cors({
      origin: env.appOrigin,
      credentials: true
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(attachAuth);

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
  });

  const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 25,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use("/api", globalLimiter);
  app.use("/api/auth", authLimiter);
  app.use("/api", verifyCsrf);
  app.use("/api", apiRoutes);

  app.use("/frontend", express.static(path.join(env.rootDir, "frontend")));
  app.use("/img", express.static(path.join(env.rootDir, "img")));
  app.use("/styles.css", express.static(path.join(env.rootDir, "styles.css")));

  app.get("/", (_req, res) => res.sendFile(path.join(env.rootDir, "index.html")));
  app.get("/index.html", (_req, res) => res.sendFile(path.join(env.rootDir, "index.html")));
  app.get("/login.html", (_req, res) => res.sendFile(path.join(env.rootDir, "login.html")));
  app.get("/admin.html", (req, res) => {
    const redirectTarget = resolveRoleRedirect(req, "/admin-login.html", ["admin", "super_admin"]);
    if (redirectTarget) {
      return res.redirect(302, redirectTarget);
    }
    return res.sendFile(path.join(env.rootDir, "admin.html"));
  });
  app.get("/admin-login.html", (req, res) => {
    const redirectTarget = req.auth?.role === "admin" ? "/admin.html" : null;
    if (redirectTarget) {
      return res.redirect(302, redirectTarget);
    }
    return res.sendFile(path.join(env.rootDir, "admin-login.html"));
  });
  app.get("/super-admin.html", (req, res) => {
    if (req.auth?.role !== "super_admin") {
      return res.redirect(302, "/super-admin-login.html");
    }
    return res.sendFile(path.join(env.rootDir, "super-admin.html"));
  });
  app.get("/super-admin-login.html", (req, res) => {
    if (req.auth?.role === "super_admin") {
      return res.redirect(302, "/super-admin.html");
    }
    return res.sendFile(path.join(env.rootDir, "super-admin-login.html"));
  });

  app.use(errorHandler);

  return app;
}

async function start() {
  ensureStorageDirectories();
  await runMigrations();
  await ensureSuperAdminAccount();

  const app = createApp();
  const server = http.createServer(app);
  initializeRealtime(server);

  cron.schedule(env.autoBackupCron, async () => {
    try {
      await createBackup({ backupType: "scheduled" });
      console.log("Scheduled backup completed");
    } catch (error) {
      console.error("Scheduled backup failed", error);
    }
  });

  server.listen(env.port, () => {
    console.log(`Crane Credit server running on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start Crane Credit platform", error);
  process.exitCode = 1;
});
