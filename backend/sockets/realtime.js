const { Server } = require("socket.io");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { findById } = require("../models/account-model");
const { setIo } = require("../services/socket-bus");
const { ACCESS_COOKIE } = require("../services/auth-service");
const { getAudienceRolesForAccount } = require("../utils/admin-roles");

function initializeRealtime(server) {
  const io = new Server(server, {
    cors: {
      origin: env.appOrigin,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie || "";
      const cookies = cookie.parse(rawCookie);
      const token = cookies[ACCESS_COOKIE];
      if (!token) {
        return next(new Error("Unauthorized"));
      }
      const payload = jwt.verify(token, env.jwtAccessSecret);
      const account = await findById(payload.sub);
      if (!account || account.status !== "active") {
        return next(new Error("Unauthorized"));
      }
      socket.auth = { account };
      return next();
    } catch (error) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const account = socket.auth.account;
    socket.join(`account:${account.id}`);
    getAudienceRolesForAccount(account).forEach((audienceRole) => {
      socket.join(`role:${audienceRole}`);
    });

    socket.on("notifications:read", (notificationIds = []) => {
      socket.emit("notifications:ack", { notificationIds });
    });
  });

  setIo(io);
  return io;
}

module.exports = { initializeRealtime };
