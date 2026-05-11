document.addEventListener("DOMContentLoaded", async () => {
  const viewOrder = ["overview", "admins", "users", "backups"];
  const sections = Array.from(document.querySelectorAll(".view-section"));
  const navLinks = Array.from(document.querySelectorAll("[data-view]"));
  const sidebarOverlay = document.querySelector(".sidebar-overlay");
  const dashboardSidebar = document.querySelector(".dashboard-sidebar");
  const contactModal = document.querySelector(".contact-modal-overlay");
  const notificationPanel = document.querySelector(".notification-panel");
  const profilePanel = document.querySelector(".profile-panel");
  const liveStatusFab = document.querySelector(".live-status-fab");
  const notificationBadge = document.querySelector(".notification-badge");
  const notificationDrawerList = document.querySelector(".notification-panel .notifications-list");
  let dashboard = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateTime(value) {
    if (!value) {
      return "Unknown";
    }
    return new Date(value).toLocaleString();
  }

  function formatStatus(status) {
    return String(status || "info").replace(/_/g, " ");
  }

  function statusTone(status) {
    if (["approved", "verified", "active", "success"].includes(status)) return "success";
    if (["rejected", "disabled", "suspended", "danger"].includes(status)) return "danger";
    if (["warning", "under_review", "verification"].includes(status)) return "warning";
    return "info";
  }

  function getAccountName(account) {
    return account?.fullName || account?.full_name || account?.username || "Super Admin";
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = String(value);
    });
  }

  async function playIntroAnimation() {
    const body = document.body;
    const siteIntro = document.querySelector(".site-intro");

    body.classList.remove("intro-loading");
    body.classList.add("intro-playing");
    await new Promise((resolve) => setTimeout(resolve, 1700));
    body.classList.remove("intro-playing");
    body.classList.add("intro-complete");
    siteIntro?.classList.add("is-hidden");
    await new Promise((resolve) => setTimeout(resolve, 550));
  }

  function setActiveView(viewName) {
    const index = viewOrder.indexOf(viewName);
    if (index === -1) {
      return;
    }

    sections.forEach((section, sectionIndex) => {
      section.classList.toggle("active", sectionIndex === index);
    });

    navLinks.forEach((link) => {
      link.classList.toggle("active", link.dataset.view === viewName);
    });
  }

  function closeSidebar() {
    sidebarOverlay?.classList.remove("active");
    dashboardSidebar?.classList.remove("active");
  }

  function openContactModal() {
    contactModal?.classList.add("active");
  }

  function closeContactModal() {
    contactModal?.classList.remove("active");
  }

  function openProfilePanel() {
    let overlay = document.querySelector(".profile-panel-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "profile-panel-overlay";
      document.body.appendChild(overlay);
    }
    profilePanel?.classList.add("active");
    overlay.classList.add("active");
  }

  function closeProfilePanel() {
    profilePanel?.classList.remove("active");
    document.querySelector(".profile-panel-overlay")?.classList.remove("active");
  }

  function updateLiveStatus(title, count = 0) {
    const titleNode = liveStatusFab?.querySelector(".live-status-title");
    const badgeNode = liveStatusFab?.querySelector(".live-status-badge");

    if (titleNode) {
      titleNode.textContent = title;
    }

    if (badgeNode) {
      if (count > 0) {
        badgeNode.textContent = String(count);
        badgeNode.style.display = "inline-flex";
        liveStatusFab?.classList.add("has-unread");
      } else {
        badgeNode.style.display = "none";
        liveStatusFab?.classList.remove("has-unread");
      }
    }
  }

  function createEmptyState(message) {
    return `<div class="panel-empty-state">${escapeHtml(message)}</div>`;
  }

  function renderNotificationFeed(host, notifications, emptyMessage, limit = notifications.length) {
    if (!host) {
      return;
    }

    const items = notifications.slice(0, limit);
    host.innerHTML = items.length
      ? items
          .map(
            (item) => `
              <article class="notification-item">
                <div class="role-item-head">
                  <div>
                    <strong>${escapeHtml(item.title || item.event_type || "Platform alert")}</strong>
                    <div class="role-list-note">${escapeHtml(item.message || item.identifier || item.ip_address || "No additional details")}</div>
                  </div>
                  <span class="role-chip ${statusTone(item.level || item.status || "info")}">${escapeHtml(item.level || "info")}</span>
                </div>
              </article>
            `
          )
          .join("")
      : createEmptyState(emptyMessage);
  }

  function buildAdminCard(admin, includeActions = true) {
    return `
      <article class="role-list-item">
        <div class="role-item-head">
          <div>
            <strong>${escapeHtml(admin.full_name || "Unnamed admin")}</strong>
            <div class="role-list-note">${escapeHtml(admin.username || admin.email || "No username")}</div>
          </div>
          <span class="role-chip ${statusTone(admin.status)}">${escapeHtml(admin.status || "active")}</span>
        </div>
        <div class="role-item-meta">
          <span>${escapeHtml(admin.phone || "No phone")}</span>
          <span>${escapeHtml((admin.permissions || []).join(", ") || "Default permissions")}</span>
        </div>
        ${
          includeActions
            ? `
              <div class="role-item-actions">
                <button type="button" class="button button-secondary" data-status-account="${admin.id}" data-status-value="${admin.status === "active" ? "disabled" : "active"}">${admin.status === "active" ? "Disable" : "Reactivate"}</button>
                <button type="button" class="button role-action-danger" data-force-logout="${admin.id}">Force Logout</button>
              </div>
            `
            : ""
        }
      </article>
    `;
  }

  function renderAdmins() {
    const admins = dashboard?.admins || [];
    document.getElementById("super-admins-list").innerHTML = admins.length
      ? admins.map((admin) => buildAdminCard(admin)).join("")
      : createEmptyState("No admins created yet.");
    document.getElementById("super-admins-preview-list").innerHTML = admins.length
      ? admins.slice(0, 4).map((admin) => buildAdminCard(admin, false)).join("")
      : createEmptyState("Admin accounts will appear here once created.");
  }

  function renderUsers() {
    const users = (dashboard?.users || []).slice(0, 14);
    document.getElementById("super-users-list").innerHTML = users.length
      ? users
          .map(
            (user) => `
              <article class="role-list-item">
                <div class="role-item-head">
                  <div>
                    <strong>${escapeHtml(user.full_name || "Unnamed user")}</strong>
                    <div class="role-list-note">${escapeHtml(user.email || user.phone || "No contact available")}</div>
                  </div>
                  <span class="role-chip ${statusTone(user.status)}">${escapeHtml(user.status || "active")}</span>
                </div>
                <div class="role-item-meta">
                  <span>${escapeHtml(user.phone || "No phone")}</span>
                  <span>${escapeHtml(user.verification_status || "unverified")}</span>
                  <span>${escapeHtml(user.role || "user")}</span>
                </div>
                <div class="role-item-actions">
                  <button type="button" class="button button-secondary" data-status-account="${user.id}" data-status-value="${user.status === "active" ? "suspended" : "active"}">${user.status === "active" ? "Suspend" : "Reactivate"}</button>
                  <button type="button" class="button role-action-danger" data-force-logout="${user.id}">Force Logout</button>
                </div>
              </article>
            `
          )
          .join("")
      : createEmptyState("No users available yet.");
  }

  function renderSecurity() {
    const events = (dashboard?.securityEvents || []).slice(0, 10);
    document.getElementById("super-security-list").innerHTML = events.length
      ? events
          .map(
            (event) => `
              <article class="role-list-item">
                <div class="role-item-head">
                  <div>
                    <strong>${escapeHtml(event.event_type || "Security event")}</strong>
                    <div class="role-list-note">${escapeHtml(event.identifier || event.ip_address || "Unknown source")}</div>
                  </div>
                  <span class="role-chip warning">${escapeHtml(formatDateTime(event.created_at))}</span>
                </div>
              </article>
            `
          )
          .join("")
      : createEmptyState("No security alerts recorded yet.");
  }

  function renderBackups() {
    const backups = dashboard?.backups || [];
    document.getElementById("super-backups-list").innerHTML = backups.length
      ? backups
          .map(
            (backup) => `
              <article class="role-list-item">
                <div class="role-item-head">
                  <div>
                    <strong>${escapeHtml(backup.file_name)}</strong>
                    <div class="role-list-note">${escapeHtml(formatDateTime(backup.created_at))}</div>
                  </div>
                  <span class="role-chip info">${escapeHtml(backup.backup_type || "manual")}</span>
                </div>
                <div class="role-item-actions">
                  <button type="button" class="button role-action-warning" data-restore-backup="${backup.file_name}">Restore</button>
                </div>
              </article>
            `
          )
          .join("")
      : createEmptyState("No backups created yet.");

    document.getElementById("super-latest-backup-label").textContent = backups[0]?.file_name || "No backup yet";
  }

  async function renderAudit() {
    const auditResponse = await window.CraneApi.request("/super-admin/audit-logs");
    const logs = auditResponse.logs || [];

    document.getElementById("super-audit-list").innerHTML = logs.length
      ? logs.slice(0, 16).map((entry) => `
          <article class="role-list-item">
            <div class="role-item-head">
              <div>
                <strong>${escapeHtml(entry.action || "system.event")}</strong>
                <div class="role-list-note">${escapeHtml(entry.actor_name || entry.actor_role || "system")} - ${escapeHtml(formatDateTime(entry.created_at))}</div>
              </div>
              <span class="role-chip info">${escapeHtml(entry.entity_type || "system")}</span>
            </div>
          </article>
        `).join("")
      : createEmptyState("No audit events available yet.");

    document.getElementById("super-actions-count").textContent = String(logs.length);
  }

  function populateSettings() {
    const settingsMap = Object.fromEntries((dashboard?.settings || []).map((item) => [item.key, item.value]));
    const form = document.getElementById("settings-form");

    form.elements.maxLoanAmount.value = settingsMap.maxLoanAmount || "";
    form.elements.dailyApprovalLimit.value = settingsMap.dailyApprovalLimit || "";
    form.elements.supportNotice.value = settingsMap.supportNotice || "";
  }

  function renderSummary() {
    const summary = dashboard?.summary || {};
    const account = window.CraneAuth.getAccount();
    const latestNotification = dashboard?.notifications?.[0];

    setText("[data-super-total-users]", summary.totalUsers || 0);
    setText("[data-super-total-admins]", summary.totalAdmins || 0);
    setText("[data-super-suspended-accounts]", summary.suspendedAccounts || 0);
    setText("[data-super-live-applications]", summary.liveApplications || 0);

    document.getElementById("super-welcome-name").textContent = getAccountName(account).split(" ")[0] || "Super Admin";
    document.getElementById("super-session-name").textContent = latestNotification
      ? `${latestNotification.title}: ${latestNotification.message}`
      : `${getAccountName(account)} is monitoring platform activity.`;

    const title = document.getElementById("super-overview-title");
    const message = document.getElementById("super-overview-message");
    const badge = document.getElementById("super-overview-badge");

    if ((summary.suspendedAccounts || 0) > 0) {
      title.textContent = `${summary.suspendedAccounts} account(s) require attention`;
      message.textContent = "Review disabled admins, suspended borrowers, and recent security events from the connected control panels.";
      badge.textContent = "Attention needed";
    } else if ((summary.totalAdmins || 0) > 0 || (summary.totalUsers || 0) > 0) {
      title.textContent = "Platform operations are live";
      message.textContent = "User, admin, backup, and application signals are flowing through the shared Crane Credit dashboards.";
      badge.textContent = "System healthy";
    } else {
      title.textContent = "System standing by";
      message.textContent = "Admin creation, account controls, settings, and backups will update here as soon as platform activity changes.";
      badge.textContent = "Observing system";
    }
  }

  function renderNotifications() {
    const notifications = dashboard?.notifications || [];
    const unreadCount = notifications.filter((item) => !item.read_at).length;

    if (notificationBadge) {
      notificationBadge.textContent = String(unreadCount);
    }

    renderNotificationFeed(document.getElementById("super-notifications-list"), notifications, "No platform alerts yet.", 6);
    renderNotificationFeed(notificationDrawerList, notifications, "No notifications yet. New alerts will appear here.", 10);

    const latestSecurity = dashboard?.securityEvents?.[0];
    if (latestSecurity) {
      updateLiveStatus(`${formatStatus(latestSecurity.event_type)} detected`, unreadCount);
    } else {
      updateLiveStatus("Monitoring platform activity", unreadCount);
    }
  }

  function renderProfile(account) {
    const avatar = document.querySelector(".profile-avatar strong");
    const title = document.querySelector(".profile-title-row h3");
    const secondary = document.querySelector(".profile-secondary-text");
    const status = document.querySelector(".profile-status-badge");

    if (avatar) {
      const parts = getAccountName(account).trim().split(/\s+/).slice(0, 2);
      avatar.textContent = parts.map((part) => part.charAt(0).toUpperCase()).join("") || "SA";
    }

    if (title) {
      title.textContent = getAccountName(account);
    }

    if (secondary) {
      secondary.textContent = "Platform operations and control";
    }

    if (status) {
      status.textContent = "Super Admin";
      status.className = "profile-status-badge verified";
    }

    document.getElementById("super-profile-email").textContent = account?.email || "Not available";
    document.getElementById("super-profile-phone").textContent = account?.phone || "Not available";
    document.getElementById("super-last-login").textContent = account?.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : "Never";
  }

  async function loadDashboard(showToast = false) {
    dashboard = await window.CraneApi.superAdminDashboard();
    renderSummary();
    renderAdmins();
    renderUsers();
    renderSecurity();
    renderBackups();
    renderNotifications();
    populateSettings();
    await renderAudit();

    if (showToast) {
      window.CraneNotify.success("Dashboard refreshed.");
    }
  }

  document.querySelectorAll("[data-view-trigger]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const viewName = button.dataset.viewTrigger;
      closeSidebar();
      setActiveView(viewName);
    });
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", async (event) => {
      const action = link.dataset.action;
      const view = link.dataset.view;

      if (action === "open-contact") {
        event.preventDefault();
        closeSidebar();
        openContactModal();
        return;
      }

      if (action === "open-login") {
        event.preventDefault();
        await window.CraneAuth.logout("super-admin-login.html");
        return;
      }

      if (view) {
        event.preventDefault();
        closeSidebar();
        setActiveView(view);
      }
    });
  });

  document.querySelector(".header-brand")?.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveView("overview");
  });

  document.querySelector('.footer-box[aria-label="Open navigation menu"]')?.addEventListener("click", () => {
    sidebarOverlay?.classList.toggle("active");
    dashboardSidebar?.classList.toggle("active");
  });

  document.querySelector('[data-action="open-profile"]')?.addEventListener("click", () => {
    openProfilePanel();
  });

  document.querySelector(".header-actions .icon-btn")?.addEventListener("click", () => {
    notificationPanel?.classList.toggle("active");
  });

  document.querySelector(".profile-panel .close-btn")?.addEventListener("click", () => {
    closeProfilePanel();
  });

  document.querySelector(".notification-panel .close-btn")?.addEventListener("click", () => {
    notificationPanel?.classList.remove("active");
  });

  document.querySelector(".contact-modal-close")?.addEventListener("click", () => {
    closeContactModal();
  });

  document.querySelector(".contact-modal-overlay")?.addEventListener("click", (event) => {
    if (event.target === contactModal) {
      closeContactModal();
    }
  });

  sidebarOverlay?.addEventListener("click", closeSidebar);

  document.addEventListener("click", (event) => {
    const overlay = document.querySelector(".profile-panel-overlay");
    if (overlay?.classList.contains("active") && event.target === overlay) {
      closeProfilePanel();
    }
  });

  document.getElementById("create-admin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const permissions = form.elements.permissions.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      await window.CraneApi.createAdmin({
        role: form.elements.role.value.trim().toLowerCase(),
        fullName: form.elements.fullName.value.trim(),
        username: form.elements.username.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        pin: form.elements.pin.value.trim(),
        permissions
      });

      form.reset();
      form.elements.role.value = "admin";
      window.CraneNotify.success("Admin account created.");
      await loadDashboard();
      setActiveView("admins");
    } catch (error) {
      window.CraneNotify.error(error.message || "Unable to create admin account.");
    }
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
      await loadDashboard();
      return;
    }

    const restoreButton = event.target.closest("[data-restore-backup]");
    if (restoreButton) {
      const confirmed = window.confirm(`Restore ${restoreButton.dataset.restoreBackup}? This replaces live data.`);
      if (!confirmed) {
        return;
      }
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
    setActiveView("backups");
  });

  document.getElementById("super-refresh-btn").addEventListener("click", () => {
    loadDashboard(true);
  });

  document.getElementById("super-logout-panel-btn").addEventListener("click", () => {
    window.CraneAuth.logout("super-admin-login.html");
  });

  liveStatusFab?.addEventListener("click", () => {
    setActiveView("users");
  });

  document.addEventListener("click", (event) => {
    const menuItem = event.target.closest(".profile-menu-item");
    if (!menuItem) {
      return;
    }

    const action = menuItem.textContent.trim().toLowerCase();
    if (action.includes("help")) {
      closeProfilePanel();
      openContactModal();
      return;
    }

    window.CraneNotify.info("This account utility will be available soon.");
  });

  window.addEventListener("crane:notification:new", () => loadDashboard());
  window.addEventListener("crane:admin:created", () => loadDashboard());
  window.addEventListener("crane:loan:created", () => loadDashboard());
  window.addEventListener("crane:loan:updated", () => loadDashboard());
  window.addEventListener("crane:document:updated", () => loadDashboard());
  window.addEventListener("crane:account:status", () => loadDashboard());
  window.addEventListener("crane:session:revoked", () => {
    window.CraneAuth.logout("super-admin-login.html");
  });

  await window.CraneAuth.bootstrap();
  const account = await window.CraneAuth.requireRole(["super_admin"], "super-admin-login.html");
  if (!account) {
    return;
  }

  renderProfile(account);
  window.CraneRealtime.connect();
  await Promise.all([playIntroAnimation(), loadDashboard()]);
});
