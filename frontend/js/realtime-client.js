(function bootstrapRealtime(global) {
  let socket = null;
  const listeners = new Map();

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
      "session:revoked",
      "admin:created"
    ].forEach((eventName) => {
      socket.on(eventName, (payload) => {
        global.dispatchEvent(new CustomEvent(`crane:${eventName}`, { detail: payload }));
      });
    });

    socket.on("session:revoked", () => {
      global.CraneAuth.logout(global.location.pathname.includes("admin") ? "login.html" : "index.html");
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
