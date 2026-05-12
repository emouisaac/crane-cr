(function bootstrapRealtime(global) {
  let socket = null;

  function getLogoutPath() {
    const pathname = global.location.pathname || "";
    if (pathname.includes("super-admin")) {
      return "/super-admin-login";
    }
    if (pathname.includes("admin")) {
      return "/admin-login";
    }
    return "/index.html";
  }

  function connect() {
    if (socket || typeof global.io !== "function" || !global.CraneAuth.getAccount()) {
      return socket;
    }

    socket = global.io({
      withCredentials: true
    });

    [
      "notification:new",
      "loan:created",
      "loan:updated",
      "document:updated",
      "user:updated",
      "account:status",
      "account:role",
      "session:revoked",
      "admin:created",
      "admin:updated"
    ].forEach((eventName) => {
      socket.on(eventName, (payload) => {
        global.dispatchEvent(new CustomEvent("crane:realtime:event", { detail: { eventName, payload } }));
        global.dispatchEvent(new CustomEvent(`crane:${eventName}`, { detail: payload }));
      });
    });

    socket.on("session:revoked", () => {
      global.CraneAuth.logout(getLogoutPath());
    });

    return socket;
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  }

  global.addEventListener("crane:session", connect);
  global.addEventListener("crane:logout", disconnect);

  global.CraneRealtime = {
    connect,
    disconnect
  };
})(window);
