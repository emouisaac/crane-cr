document.addEventListener("DOMContentLoaded", async () => {
  const viewOrder = ["overview", "applications", "admins", "users", "backups"];
  const sections = Array.from(document.querySelectorAll(".view-section"));
  const viewSections = Object.fromEntries(viewOrder.map((view, index) => [view, sections[index]]));
  const navLinks = Array.from(document.querySelectorAll("[data-view]"));
  const sidebarOverlay = document.querySelector(".sidebar-overlay");
  const dashboardSidebar = document.querySelector(".dashboard-sidebar");
  const contactModal = document.querySelector(".contact-modal-overlay");
  const notificationPanel = document.querySelector(".notification-panel");
  const profilePanel = document.querySelector(".profile-panel");
  const notificationBadge = document.querySelector(".notification-badge");
  const notificationDrawerList = document.querySelector(".notification-panel .notifications-list");
  const roleField = document.getElementById("super-admin-role");
  const permissionsPreview = document.getElementById("super-admin-permissions");
  let dashboard = null;
  let refreshTimer = null;
  let selectedLoanId = null;
  let selectedLoanDetail = null;

  const ADMIN_ROLE_OPTIONS = [
    { value: "manager", label: "Manager" },
    { value: "secretary", label: "Secretary" },
    { value: "loan_officer", label: "Loan Officer" },
    { value: "contact_support", label: "Contact Support" },
    { value: "analyst", label: "Analyst" },
    { value: "compliance_officer", label: "Compliance Officer" },
    { value: "recovery_officer", label: "Recovery Officer" },
    { value: "cashier", label: "Cashier" }
  ];

  const ADMIN_ROLE_DESCRIPTIONS = {
    manager: "Full workspace access across applications, documents, borrowers, notes, document requests, and borrower PIN resets. Final loan approval still remains super-admin only.",
    secretary: "Queue coordination, borrower visibility, borrower PIN resets, internal notes, and document request follow-up.",
    loan_officer: "Full workspace access across applications, documents, borrowers, notes, document requests, and borrower PIN resets. Final loan approval still remains super-admin only.",
    contact_support: "Borrower support, borrower PIN resets, internal notes, notifications, and document request communication.",
    analyst: "Application review, borrower visibility, borrower PIN resets, document verification, and operational analysis.",
    compliance_officer: "Application and document compliance checks with notes and alert visibility.",
    recovery_officer: "Borrower follow-up, borrower PIN resets, notes, and operational notifications for recovery workflows.",
    cashier: "Borrower visibility, borrower PIN resets, queue awareness, and internal operational coordination."
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatDateTime(value) {
    return value ? new Date(value).toLocaleString() : "Unknown";
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

  function getAdminRoleLabel(adminRole) {
    return ADMIN_ROLE_OPTIONS.find((option) => option.value === adminRole)?.label || "Manager";
  }

  function getAdminRoleDescription(adminRole) {
    return ADMIN_ROLE_DESCRIPTIONS[adminRole] || ADMIN_ROLE_DESCRIPTIONS.manager;
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
    if (!viewSections[viewName]) {
      return;
    }

    Object.entries(viewSections).forEach(([view, section]) => {
      section?.classList.toggle("active", view === viewName);
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

  function openRequestDocumentsWorkspace() {
    if (!selectedLoanDetail?.loan) {
      window.CraneNotify.info("Select an application first.");
      return;
    }

    setActiveView("applications");
    const requestField = document.getElementById("super-request-documents-message");
    window.setTimeout(() => {
      requestField?.focus();
      requestField?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
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

  function createEmptyState(message) {
    return `<div class="panel-empty-state">${escapeHtml(message)}</div>`;
  }

  function updateRoleAccessPreview() {
    if (!permissionsPreview || !roleField) {
      return;
    }
    permissionsPreview.value = getAdminRoleDescription(roleField.value);
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

  function buildRoleSelect(admin) {
    const options = ADMIN_ROLE_OPTIONS.map((option) => `
      <option value="${option.value}" ${option.value === admin.admin_role ? "selected" : ""}>${option.label}</option>
    `).join("");

    return `
      <select class="role-inline-select" data-admin-role-select="${admin.id}" aria-label="Select admin role for ${escapeHtml(admin.full_name || "admin")}">
        ${options}
      </select>
    `;
  }

  function buildAdminCard(admin, includeActions = true) {
    const roleLabel = admin.role === "super_admin" ? "Super Admin" : getAdminRoleLabel(admin.admin_role);
    const roleDescription = admin.role === "super_admin"
      ? "Platform-wide control, role changes, backups, settings, and approvals."
      : getAdminRoleDescription(admin.admin_role);

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
          <span>${escapeHtml(roleLabel)}</span>
        </div>
        <div class="role-list-note">${escapeHtml(roleDescription)}</div>
        ${
          includeActions && admin.role === "admin"
            ? `
              <div class="role-item-actions">
                ${buildRoleSelect(admin)}
                <button type="button" class="button button-secondary" data-save-admin-role="${admin.id}">Save Role</button>
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
                  <button type="button" class="button button-secondary" data-reset-account-pin="${user.id}">Reset PIN</button>
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

  function buildApplicationItem(loan, isActive = false) {
    return `
      <button type="button" class="role-list-item is-interactive ${isActive ? "is-active" : ""}" data-super-loan-id="${loan.id}">
        <div class="role-item-head">
          <div>
            <strong>${escapeHtml(loan.application_code)}</strong>
            <div class="role-list-note">${escapeHtml(loan.user_name || "Unknown borrower")}</div>
          </div>
          <span class="role-chip ${statusTone(loan.status)}">${escapeHtml(formatStatus(loan.status))}</span>
        </div>
        <div class="role-item-meta">
          <span>${escapeHtml(formatCurrency(loan.amount))}</span>
          <span>${escapeHtml(`${loan.term_months} months`)}</span>
          <span>${escapeHtml(formatStatus(loan.purpose || "general"))}</span>
        </div>
      </button>
    `;
  }

  function renderApplications() {
    const host = document.getElementById("super-applications-list");
    const loans = dashboard?.loans || [];
    if (!host) {
      return;
    }

    host.innerHTML = loans.length
      ? loans.map((loan) => buildApplicationItem(loan, selectedLoanId === loan.id)).join("")
      : createEmptyState("No applications currently require a super admin decision.");
  }

  function clearLoanDetail() {
    selectedLoanDetail = null;
    document.getElementById("super-application-detail-empty").hidden = false;
    document.getElementById("super-application-detail").hidden = true;
    document.getElementById("super-detail-documents").innerHTML = createEmptyState("Choose an application from the list above to inspect its supporting documents.");
    document.getElementById("super-detail-comments").innerHTML = createEmptyState("No super admin notes have been added yet.");
    document.getElementById("super-documents-empty-state").hidden = false;
    document.getElementById("super-documents-context").textContent = "Select an application first to inspect supporting files and approve or request re-uploads.";

    ["super-request-documents-form", "super-note-form"].forEach((formId) => {
      const form = document.getElementById(formId);
      if (form) {
        Array.from(form.elements).forEach((element) => {
          element.disabled = true;
        });
      }
    });
  }

  function renderSelectedLoanContext() {
    if (!selectedLoanDetail?.loan) {
      clearLoanDetail();
      return;
    }

    const loan = selectedLoanDetail.loan;
    document.getElementById("super-documents-context").textContent = `${loan.application_code} for ${loan.user_name || "borrower"} is open for super admin review, document follow-up, and final decision.`;
  }

  function renderLoanDetail() {
    if (!selectedLoanDetail?.loan) {
      clearLoanDetail();
      return;
    }

    const { loan, documents, comments } = selectedLoanDetail;
    document.getElementById("super-application-detail-empty").hidden = true;
    document.getElementById("super-application-detail").hidden = false;
    document.getElementById("super-detail-title").textContent = `${loan.application_code} - ${loan.user_name || "Borrower"}`;
    document.getElementById("super-detail-subtitle").textContent = `${formatCurrency(loan.amount)} over ${loan.term_months} months`;

    const statusNode = document.getElementById("super-detail-status");
    statusNode.textContent = formatStatus(loan.status);
    statusNode.className = `role-status-badge ${statusTone(loan.status)}`;

    const address = loan.address_details || {};
    document.getElementById("super-detail-meta").innerHTML = `
      <div class="role-meta-card">
        <span>Email</span>
        <strong>${escapeHtml(loan.user_email || "Not provided")}</strong>
      </div>
      <div class="role-meta-card">
        <span>Phone</span>
        <strong>${escapeHtml(loan.user_phone || "Not provided")}</strong>
      </div>
      <div class="role-meta-card">
        <span>Purpose</span>
        <strong>${escapeHtml(formatStatus(loan.purpose || "general"))}</strong>
      </div>
      <div class="role-meta-card">
        <span>District</span>
        <strong>${escapeHtml(address.district || "Not provided")}</strong>
      </div>
      <div class="role-meta-card">
        <span>Applicant Category</span>
        <strong>${escapeHtml(formatStatus(loan.applicant_category || "general"))}</strong>
      </div>
      <div class="role-meta-card">
        <span>Duplicate Risk</span>
        <strong>${escapeHtml(`${loan.duplicate_risk_score || 0}/100`)}</strong>
      </div>
    `;

    document.getElementById("super-documents-empty-state").hidden = true;
    document.getElementById("super-detail-documents").innerHTML = documents.length
      ? documents
          .map(
            (doc) => `
              <article class="role-list-item">
                <div class="role-item-head">
                  <div>
                    <strong>${escapeHtml(formatStatus(doc.document_type))}</strong>
                    <div class="role-list-note">Sharpness ${escapeHtml(Number(doc.sharpness_score || 0).toFixed(1))}</div>
                  </div>
                  <span class="role-chip ${statusTone(doc.status)}">${escapeHtml(formatStatus(doc.status))}</span>
                </div>
                <div class="role-item-actions">
                  <a class="button button-secondary" href="/api/admin/documents/${doc.id}/file" target="_blank" rel="noopener noreferrer">Open File</a>
                  <button type="button" class="button button-primary" data-super-document-id="${doc.id}" data-super-document-status="verified">Verify</button>
                  <button type="button" class="button role-action-danger" data-super-document-id="${doc.id}" data-super-document-status="rejected">Reject</button>
                </div>
              </article>
            `
          )
          .join("")
      : createEmptyState("No documents uploaded yet.");

    document.getElementById("super-detail-comments").innerHTML = comments.length
      ? comments
          .map(
            (comment) => `
              <article class="role-list-item">
                <div class="role-item-head">
                  <div>
                    <strong>${escapeHtml(comment.author_name || "Unknown author")}</strong>
                    <div class="role-list-note">${escapeHtml(comment.author_role || "system")} - ${escapeHtml(formatDateTime(comment.created_at))}</div>
                  </div>
                  <span class="role-chip ${comment.visibility === "internal" ? "info" : "warning"}">${escapeHtml(comment.visibility || "internal")}</span>
                </div>
                <div class="role-list-note">${escapeHtml(comment.message || "")}</div>
              </article>
            `
          )
          .join("")
      : createEmptyState("No super admin notes have been added yet.");

    ["super-request-documents-form", "super-note-form"].forEach((formId) => {
      const form = document.getElementById(formId);
      if (form) {
        Array.from(form.elements).forEach((element) => {
          element.disabled = false;
        });
      }
    });

    renderSelectedLoanContext();
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
    form.elements.defaultInterestRate.value = settingsMap.defaultInterestRate || 17;
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
    renderApplications();
    renderAdmins();
    renderUsers();
    renderSecurity();
    renderBackups();
    renderNotifications();
    populateSettings();
    await renderAudit();

    if (selectedLoanId && dashboard.loans.some((loan) => loan.id === selectedLoanId)) {
      await fetchLoanDetail(selectedLoanId);
    } else {
      clearLoanDetail();
      selectedLoanId = null;
      renderApplications();
    }

    if (showToast) {
      window.CraneNotify.success("Dashboard refreshed.");
    }
  }

  function scheduleDashboardRefresh(showToast = false) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      loadDashboard(showToast).catch((error) => {
        window.CraneNotify.error(error.message || "Unable to refresh the dashboard.");
      });
    }, 120);
  }

  async function fetchLoanDetail(loanId) {
    selectedLoanId = loanId;
    renderApplications();
    selectedLoanDetail = await window.CraneApi.adminApplication(loanId);
    renderLoanDetail();
  }

  window.CraneContactActions?.bind?.();

  document.querySelectorAll("[data-view-trigger]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      closeSidebar();
      setActiveView(button.dataset.viewTrigger);
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
        await window.CraneAuth.logout("/super-admin-login");
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

  roleField?.addEventListener("change", updateRoleAccessPreview);
  updateRoleAccessPreview();

  document.getElementById("create-admin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;

    try {
      await window.CraneApi.createAdmin({
        adminRole: form.elements.adminRole.value,
        fullName: form.elements.fullName.value.trim(),
        username: form.elements.username.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        pin: form.elements.pin.value.trim()
      });

      form.reset();
      form.elements.adminRole.value = "manager";
      updateRoleAccessPreview();
      window.CraneNotify.success("Admin account created.");
      await loadDashboard();
      setActiveView("admins");
    } catch (error) {
      window.CraneNotify.error(error.message || "Unable to create admin account.");
    }
  });

  document.body.addEventListener("click", async (event) => {
    const saveRoleButton = event.target.closest("[data-save-admin-role]");
    if (saveRoleButton) {
      const select = document.querySelector(`[data-admin-role-select="${saveRoleButton.dataset.saveAdminRole}"]`);
      if (!select) {
        return;
      }
      await window.CraneApi.updateAdminRole(saveRoleButton.dataset.saveAdminRole, select.value);
      window.CraneNotify.success("Admin role updated.");
      await loadDashboard();
      return;
    }

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

    const resetPinButton = event.target.closest("[data-reset-account-pin]");
    if (resetPinButton) {
      const nextPin = window.prompt("Enter the new 6-digit borrower PIN:", "") || "";
      if (!nextPin) {
        return;
      }
      await window.CraneApi.resetAccountPin(resetPinButton.dataset.resetAccountPin, nextPin);
      window.CraneNotify.success("Borrower PIN reset.");
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

  document.getElementById("super-applications-list").addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-super-loan-id]");
    if (!trigger) {
      return;
    }
    await fetchLoanDetail(trigger.dataset.superLoanId);
  });

  document.getElementById("super-application-detail").addEventListener("click", async (event) => {
    const requestDocumentsButton = event.target.closest("[data-super-open-request-documents]");
    if (requestDocumentsButton) {
      if (requestDocumentsButton.disabled) {
        return;
      }
      openRequestDocumentsWorkspace();
      return;
    }

    const statusButton = event.target.closest("[data-super-status-action]");
    if (!statusButton || !selectedLoanId) {
      return;
    }

    const notes = window.prompt("Optional super admin note:", "") || "";
    await window.CraneApi.updateLoanStatus(selectedLoanId, {
      status: statusButton.dataset.superStatusAction,
      notes
    });
    window.CraneNotify.success(
      statusButton.dataset.superStatusAction === "approved"
        ? "Loan approved successfully."
        : "Application status updated."
    );
    await loadDashboard();
  });

  document.getElementById("super-detail-documents").addEventListener("click", async (event) => {
    const documentButton = event.target.closest("[data-super-document-id]");
    if (!documentButton || !selectedLoanId) {
      return;
    }

    const notes = window.prompt("Document review note:", "") || "";
    await window.CraneApi.verifyDocument(documentButton.dataset.superDocumentId, {
      status: documentButton.dataset.superDocumentStatus,
      notes
    });
    window.CraneNotify.success("Document review updated.");
    await fetchLoanDetail(selectedLoanId);
    await loadDashboard();
  });

  document.getElementById("super-request-documents-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedLoanId) {
      window.CraneNotify.info("Select an application first.");
      return;
    }

    const message = event.currentTarget.elements.message.value.trim();
    if (!message) {
      return;
    }

    await window.CraneApi.requestDocuments(selectedLoanId, { message });
    event.currentTarget.reset();
    window.CraneNotify.success("Borrower notified.");
    await loadDashboard();
  });

  document.getElementById("super-note-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedLoanId) {
      window.CraneNotify.info("Select an application first.");
      return;
    }

    const message = event.currentTarget.elements.message.value.trim();
    if (!message) {
      return;
    }

    await window.CraneApi.addAdminComment(selectedLoanId, { message, visibility: "internal" });
    event.currentTarget.reset();
    window.CraneNotify.success("Super admin note saved.");
    await fetchLoanDetail(selectedLoanId);
  });

  document.getElementById("settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;

    await window.CraneApi.updateSettings({
      maxLoanAmount: Number(form.elements.maxLoanAmount.value || 0),
      dailyApprovalLimit: Number(form.elements.dailyApprovalLimit.value || 0),
      defaultInterestRate: Number(form.elements.defaultInterestRate.value || 17),
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
    window.CraneAuth.logout("/super-admin-login");
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

  window.addEventListener("crane:notification:new", () => scheduleDashboardRefresh());
  window.addEventListener("crane:admin:created", () => scheduleDashboardRefresh());
  window.addEventListener("crane:admin:updated", () => scheduleDashboardRefresh());
  window.addEventListener("crane:loan:created", () => scheduleDashboardRefresh());
  window.addEventListener("crane:loan:updated", () => scheduleDashboardRefresh());
  window.addEventListener("crane:document:updated", () => scheduleDashboardRefresh());
  window.addEventListener("crane:account:status", () => scheduleDashboardRefresh());
  window.addEventListener("crane:session:revoked", () => {
    window.CraneAuth.logout("/super-admin-login");
  });

  await window.CraneAuth.bootstrap();
  const account = await window.CraneAuth.requireRole(["super_admin"], "/super-admin-login");
  if (!account) {
    return;
  }

  renderProfile(account);
  window.CraneRealtime.connect();
  await Promise.all([playIntroAnimation(), loadDashboard()]);
});
