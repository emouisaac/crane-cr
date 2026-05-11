document.addEventListener("DOMContentLoaded", async () => {
  let dashboard = null;

  function renderSummary() {
    document.getElementById("super-total-users").textContent = dashboard.summary.totalUsers;
    document.getElementById("super-total-admins").textContent = dashboard.summary.totalAdmins;
    document.getElementById("super-suspended-accounts").textContent = dashboard.summary.suspendedAccounts;
    document.getElementById("super-live-applications").textContent = dashboard.summary.liveApplications;
  }

  function renderAdmins() {
    const host = document.getElementById("super-admins-list");
    host.innerHTML = dashboard.admins.map((admin) => `
      <article class="panel-item">
        <strong>${admin.full_name}</strong>
        <div class="muted">${admin.username || admin.email || "no username"}</div>
        <div class="row-actions">
          <button type="button" class="super-btn secondary" data-status-account="${admin.id}" data-status-value="${admin.status === "active" ? "disabled" : "active"}">${admin.status === "active" ? "Disable" : "Reactivate"}</button>
          <button type="button" class="super-btn danger" data-force-logout="${admin.id}">Force Logout</button>
        </div>
      </article>
    `).join("");
  }

  function renderUsers() {
    const host = document.getElementById("super-users-list");
    host.innerHTML = dashboard.users.slice(0, 12).map((user) => `
      <article class="panel-item">
        <strong>${user.full_name}</strong>
        <div class="muted">${user.phone || user.email || "no contact"} • ${user.status}</div>
        <div class="row-actions">
          <button type="button" class="super-btn secondary" data-status-account="${user.id}" data-status-value="${user.status === "active" ? "suspended" : "active"}">${user.status === "active" ? "Suspend" : "Reactivate"}</button>
          <button type="button" class="super-btn danger" data-force-logout="${user.id}">Force Logout</button>
        </div>
      </article>
    `).join("");
  }

  function renderBackups() {
    const host = document.getElementById("super-backups-list");
    host.innerHTML = dashboard.backups.length
      ? dashboard.backups.map((backup) => `
        <article class="panel-item">
          <strong>${backup.file_name}</strong>
          <div class="muted">${new Date(backup.created_at).toLocaleString()} • ${backup.backup_type}</div>
          <div class="row-actions">
            <button type="button" class="super-btn warning" data-restore-backup="${backup.file_name}">Restore</button>
          </div>
        </article>
      `).join("")
      : '<article class="panel-item">No backups created yet.</article>';
  }

  function renderSecurity() {
    document.getElementById("super-security-list").innerHTML = dashboard.securityEvents.slice(0, 10).map((event) => `
      <article class="panel-item">
        <strong>${event.event_type}</strong>
        <div class="muted">${event.identifier || event.ip_address || "unknown source"} • ${new Date(event.created_at).toLocaleString()}</div>
      </article>
    `).join("");
  }

  async function renderAudit() {
    const auditResponse = await window.CraneApi.request("/super-admin/audit-logs");
    document.getElementById("super-audit-list").innerHTML = auditResponse.logs.slice(0, 12).map((entry) => `
      <article class="panel-item">
        <strong>${entry.action}</strong>
        <div class="muted">${entry.actor_name || entry.actor_role || "system"} • ${new Date(entry.created_at).toLocaleString()}</div>
      </article>
    `).join("");
  }

  function populateSettings() {
    const settingsMap = Object.fromEntries((dashboard.settings || []).map((item) => [item.key, item.value]));
    const form = document.getElementById("settings-form");
    form.elements.maxLoanAmount.value = settingsMap.maxLoanAmount || "";
    form.elements.dailyApprovalLimit.value = settingsMap.dailyApprovalLimit || "";
    form.elements.supportNotice.value = settingsMap.supportNotice || "";
  }

  async function loadDashboard() {
    dashboard = await window.CraneApi.superAdminDashboard();
    renderSummary();
    renderAdmins();
    renderUsers();
    renderBackups();
    renderSecurity();
    populateSettings();
    await renderAudit();
  }

  document.getElementById("create-admin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const permissions = form.elements.permissions.value.split(",").map((item) => item.trim()).filter(Boolean);
    await window.CraneApi.createAdmin({
      fullName: form.elements.fullName.value.trim(),
      username: form.elements.username.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      pin: form.elements.pin.value.trim(),
      permissions
    });
    form.reset();
    window.CraneNotify.success("Admin account created.");
    await loadDashboard();
  });

  document.body.addEventListener("click", async (event) => {
    const statusButton = event.target.closest("[data-status-account]");
    if (statusButton) {
      await window.CraneApi.updateAccountStatus(statusButton.dataset.statusAccount, statusButton.dataset.statusValue);
      window.CraneNotify.success("Account status updated.");
      await loadDashboard();
      return;
    }

    const logoutButton = event.target.closest("[data-force-logout]");
    if (logoutButton) {
      await window.CraneApi.forceLogout(logoutButton.dataset.forceLogout);
      window.CraneNotify.success("Account sessions revoked.");
      return;
    }

    const restoreButton = event.target.closest("[data-restore-backup]");
    if (restoreButton) {
      const confirmed = window.confirm(`Restore ${restoreButton.dataset.restoreBackup}? This replaces live data.`);
      if (!confirmed) return;
      await window.CraneApi.restoreBackup(restoreButton.dataset.restoreBackup);
      window.CraneNotify.warning("Backup restore completed.");
      await loadDashboard();
    }
  });

  document.getElementById("settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    await window.CraneApi.updateSettings({
      maxLoanAmount: Number(form.elements.maxLoanAmount.value || 0),
      dailyApprovalLimit: Number(form.elements.dailyApprovalLimit.value || 0),
      supportNotice: form.elements.supportNotice.value.trim()
    });
    window.CraneNotify.success("Platform settings saved.");
    await loadDashboard();
  });

  document.getElementById("super-backup-btn").addEventListener("click", async () => {
    await window.CraneApi.createBackup("manual");
    window.CraneNotify.success("Backup created.");
    await loadDashboard();
  });
  document.getElementById("super-refresh-btn").addEventListener("click", () => loadDashboard());
  document.getElementById("super-logout-btn").addEventListener("click", () => window.CraneAuth.logout("super-admin-login.html"));

  window.addEventListener("crane:notification:new", loadDashboard);
  window.addEventListener("crane:admin:created", loadDashboard);
  window.addEventListener("crane:loan:created", loadDashboard);
  window.addEventListener("crane:loan:updated", loadDashboard);

  await window.CraneAuth.bootstrap();
  const account = await window.CraneAuth.requireRole(["super_admin"], "super-admin-login.html");
  if (!account) return;
  window.CraneRealtime.connect();
  await loadDashboard();
});
