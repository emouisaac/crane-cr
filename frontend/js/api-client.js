(function bootstrapApiClient(global) {
  const metaBase = document.querySelector('meta[name="crane-api-base"]')?.content?.trim();
  const apiBase = metaBase || "/api";
  let refreshPromise = null;

  function getCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function parseResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const message = typeof data === "string" ? data : data.error || "Request failed";
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function refreshSession() {
    if (!refreshPromise) {
      refreshPromise = fetch(`${apiBase}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-CSRF-Token": getCookie("crane_csrf")
        }
      })
        .then(parseResponse)
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  async function request(path, options = {}) {
    const {
      method = "GET",
      body,
      headers = {},
      retry = true,
      isFormData = false
    } = options;

    const finalHeaders = {
      ...headers
    };

    if (!["GET", "HEAD"].includes(method.toUpperCase())) {
      finalHeaders["X-CSRF-Token"] = getCookie("crane_csrf");
    }

    let payload = body;
    if (body && !isFormData) {
      finalHeaders["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const response = await fetch(`${apiBase}${path}`, {
      method,
      credentials: "include",
      headers: finalHeaders,
      body: payload
    });

    if (response.status === 401 && retry && path !== "/auth/refresh" && !path.startsWith("/auth/")) {
      try {
        await refreshSession();
        return request(path, { ...options, retry: false });
      } catch (error) {
        throw error;
      }
    }

    return parseResponse(response);
  }

  const api = {
    request,
    bootstrap: () => request("/public/bootstrap"),
    health: () => request("/public/health"),
    session: () => request("/auth/session"),
    registerUser: (body) => request("/auth/register", { method: "POST", body }),
    loginUser: (body) => request("/auth/login", { method: "POST", body }),
    loginAdmin: (body) => request("/auth/admin/login", { method: "POST", body }),
    loginSuperAdmin: (body) => request("/auth/super-admin/login", { method: "POST", body }),
    logout: () => request("/auth/logout", { method: "POST" }),
    userDashboard: () => request("/users/dashboard"),
    updateProfile: (body) => request("/users/me", { method: "PUT", body }),
    applyLoan: (body) => request("/users/loans", { method: "POST", body }),
    uploadLoanDocument(loanId, documentType, file) {
      const formData = new FormData();
      formData.append("documentType", documentType);
      formData.append("document", file);
      return request(`/users/loans/${loanId}/documents`, {
        method: "POST",
        body: formData,
        isFormData: true
      });
    },
    userNotifications: () => request("/users/notifications"),
    markNotificationRead: (notificationId) => request(`/users/notifications/${notificationId}/read`, { method: "POST" }),
    adminDashboard: () => request("/admin/dashboard"),
    adminApplication: (loanId) => request(`/admin/applications/${loanId}`),
    updateLoanStatus: (loanId, body) => request(`/admin/applications/${loanId}/status`, { method: "PATCH", body }),
    requestDocuments: (loanId, body) => request(`/admin/applications/${loanId}/request-documents`, { method: "POST", body }),
    verifyDocument: (documentId, body) => request(`/admin/documents/${documentId}`, { method: "PATCH", body }),
    addAdminComment: (loanId, body) => request(`/admin/applications/${loanId}/comments`, { method: "POST", body }),
    superAdminDashboard: () => request("/super-admin/dashboard"),
    createAdmin: (body) => request("/super-admin/admins", { method: "POST", body }),
    updateAdminRole: (accountId, adminRole) => request(`/super-admin/accounts/${accountId}/admin-role`, { method: "PATCH", body: { adminRole } }),
    updateAccountStatus: (accountId, status) => request(`/super-admin/accounts/${accountId}/status`, { method: "PATCH", body: { status } }),
    forceLogout: (accountId) => request(`/super-admin/accounts/${accountId}/force-logout`, { method: "POST" }),
    updatePermissions: (accountId, permissions) => request(`/super-admin/accounts/${accountId}/permissions`, { method: "PATCH", body: { permissions } }),
    createBackup: (backupType = "manual") => request("/super-admin/backups", { method: "POST", body: { backupType } }),
    restoreBackup: (fileName) => request("/super-admin/backups/restore", { method: "POST", body: { fileName } }),
    updateSettings: (body) => request("/super-admin/settings", { method: "PUT", body })
  };

  global.CraneApi = api;
})(window);
