(function bootstrapNotifications(global) {
  function ensureContainer() {
    let container = document.querySelector(".crane-toast-stack");
    if (!container) {
      const style = document.createElement("style");
      style.textContent = `
        .crane-toast-stack{position:fixed;top:1rem;right:1rem;z-index:5000;display:grid;gap:.75rem;max-width:min(92vw,360px)}
        .crane-toast{padding:.9rem 1rem;border-radius:14px;color:#fff;box-shadow:0 16px 32px rgba(17,24,39,.18);font:500 14px/1.4 Manrope,sans-serif;animation:crane-toast-in .18s ease-out}
        .crane-toast.info{background:#2563eb}.crane-toast.success{background:#15803d}.crane-toast.warning{background:#b45309}.crane-toast.error{background:#b91c1c}
        @keyframes crane-toast-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      `;
      document.head.appendChild(style);

      container = document.createElement("div");
      container.className = "crane-toast-stack";
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type = "info", timeout = 4000) {
    const container = ensureContainer();
    const item = document.createElement("div");
    item.className = `crane-toast ${type}`;
    item.textContent = message;
    container.appendChild(item);
    global.setTimeout(() => item.remove(), timeout);
  }

  global.CraneNotify = {
    info: (message) => show(message, "info"),
    success: (message) => show(message, "success"),
    warning: (message) => show(message, "warning", 5000),
    error: (message) => show(message, "error", 5500)
  };
})(window);
