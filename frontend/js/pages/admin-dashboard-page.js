document.addEventListener("DOMContentLoaded", async () => {
  const viewOrder = ["overview", "applications", "borrowers", "documents"];
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
  let selectedLoanId = null;
  let selectedLoanDetail = null;

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
    if (!value) {
      return "Unknown";
    }
    return new Date(value).toLocaleString();
  }

  function formatStatus(status) {
    return String(status || "pending").replace(/_/g, " ");
  }

  function statusTone(status) {
    if (["approved", "disbursed", "closed", "verified", "active"].includes(status)) return "success";
    if (["rejected", "suspended", "disabled"].includes(status)) return "danger";
    if (["under_review", "verification", "warning"].includes(status)) return "warning";
    return "info";
  }

  function getAccountName(account) {
    return account?.fullName || account?.full_name || account?.username || "Admin";
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

  function openContactModal() {
    contactModal?.classList.add("active");
  }

  function closeContactModal() {
    contactModal?.classList.remove("active");
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
                    <strong>${escapeHtml(item.title || "Notification")}</strong>
                    <div class="role-list-note">${escapeHtml(item.message || "")}</div>
                  </div>
                  <span class="role-chip ${statusTone(item.level || item.status || "info")}">${escapeHtml(item.level || "info")}</span>
                </div>
              </article>
            `
          )
          .join("")
      : createEmptyState(emptyMessage);
  }

  function buildApplicationItem(loan, isActive = false) {
    return `
      <button type="button" class="role-list-item is-interactive ${isActive ? "is-active" : ""}" data-loan-id="${loan.id}">
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
    const fullList = document.getElementById("applications-list");
    const previewList = document.getElementById("applications-preview-list");
    const loans = dashboard?.loans || [];

    fullList.innerHTML = loans.length ? loans.map((loan) => buildApplicationItem(loan, selectedLoanId === loan.id)).join("") : createEmptyState("No applications available.");
    previewList.innerHTML = loans.length
      ? loans.slice(0, 4).map((loan) => buildApplicationItem(loan, selectedLoanId === loan.id)).join("")
      : createEmptyState("No applications waiting in the queue.");
  }

  function renderUsers() {
    const host = document.getElementById("admin-users-list");
    const users = (dashboard?.users || []).slice(0, 12);

    host.innerHTML = users.length
      ? users
          .map(
            (user) => `
              <article class="role-list-item">
                <div class="role-item-head">
                  <div>
                    <strong>${escapeHtml(user.full_name || "Unnamed borrower")}</strong>
                    <div class="role-list-note">${escapeHtml(user.email || "No email on file")}</div>
                  </div>
                  <span class="role-chip ${statusTone(user.status)}">${escapeHtml(user.status || "active")}</span>
                </div>
                <div class="role-item-meta">
                  <span>${escapeHtml(user.phone || "No phone")}</span>
                  <span>${escapeHtml(user.verification_status || "unverified")}</span>
                  <span>${escapeHtml(user.role || "user")}</span>
                </div>
              </article>
            `
          )
          .join("")
      : createEmptyState("No borrowers available yet.");
  }

  function renderSummary() {
    const summary = dashboard?.summary || {};
    const account = window.CraneAuth.getAccount();
    const loans = dashboard?.loans || [];
    const pendingLoan = loans.find((loan) => ["submitted", "under_review", "verification"].includes(loan.status));

    setText("[data-admin-total-applications]", summary.totalApplications || 0);
    setText("[data-admin-pending-review]", summary.pendingReview || 0);
    setText("[data-admin-approved-today]", summary.approvedToday || 0);
    setText("[data-admin-active-users]", summary.activeUsers || 0);

    document.getElementById("admin-welcome-name").textContent = getAccountName(account).split(" ")[0] || "Admin";
    document.getElementById("admin-session-name").textContent = pendingLoan
      ? `Focus: ${pendingLoan.application_code} for ${pendingLoan.user_name || "borrower"}`
      : `${getAccountName(account)} is monitoring the queue.`;

    const title = document.getElementById("admin-overview-title");
    const message = document.getElementById("admin-overview-message");
    const badge = document.getElementById("admin-overview-badge");

    if ((summary.pendingReview || 0) > 0) {
      title.textContent = `${summary.pendingReview} application(s) need review`;
      message.textContent = "Open the queue to move borrowers through review, verification, approval, or document follow-up.";
      badge.textContent = "Action required";
    } else if ((summary.totalApplications || 0) > 0) {
      title.textContent = "Queue is under control";
      message.textContent = "All current applications have been reviewed or are waiting on the next workflow step.";
      badge.textContent = "Flow is stable";
    } else {
      title.textContent = "No applications require action yet";
      message.textContent = "New applications, status changes, and borrower document updates will surface here immediately.";
      badge.textContent = "Monitoring queue";
    }

    document.getElementById("admin-reviewed-count").textContent = String(
      loans.filter((loan) => ["under_review", "verification", "approved", "disbursed", "rejected", "closed"].includes(loan.status)).length
    );
  }

  function renderNotifications() {
    const notifications = dashboard?.notifications || [];
    const unreadCount = notifications.filter((item) => !item.read_at).length;

    if (notificationBadge) {
      notificationBadge.textContent = String(unreadCount);
    }

    renderNotificationFeed(document.getElementById("admin-overview-activity-list"), notifications, "No platform alerts yet.", 4);
    renderNotificationFeed(document.getElementById("admin-notifications-list"), notifications, "No notifications yet.", 10);
    renderNotificationFeed(notificationDrawerList, notifications, "No notifications yet. New account alerts will appear here.", 10);

    const firstLoan = dashboard?.loans?.[0];
    if (firstLoan) {
      updateLiveStatus(`${firstLoan.application_code} is ${formatStatus(firstLoan.status)}`, unreadCount);
    } else {
      updateLiveStatus("Watching the applications queue", unreadCount);
    }
  }

  function clearLoanDetail() {
    selectedLoanDetail = null;
    document.getElementById("application-detail-empty").hidden = false;
    document.getElementById("application-detail").hidden = true;
    document.getElementById("detail-documents").innerHTML = createEmptyState("Choose an application from the Applications view to load its documents here.");
    document.getElementById("detail-comments").innerHTML = createEmptyState("No internal or borrower-visible comments yet.");
    document.getElementById("documents-empty-state").hidden = false;
    document.getElementById("admin-documents-context").textContent = "Select an application first to review uploads, request corrections, and leave an internal trail.";
    document.getElementById("admin-selected-loan-label").textContent = "Awaiting selection";
  }

  function renderSelectedLoanContext() {
    if (!selectedLoanDetail?.loan) {
      clearLoanDetail();
      return;
    }

    document.getElementById("admin-selected-loan-label").textContent = selectedLoanDetail.loan.application_code;
    document.getElementById("admin-documents-context").textContent = `${selectedLoanDetail.loan.application_code} for ${selectedLoanDetail.loan.user_name || "borrower"} is loaded for document review and comment follow-up.`;
  }

  function renderLoanDetail() {
    if (!selectedLoanDetail?.loan) {
      clearLoanDetail();
      return;
    }

    const { loan, documents, comments } = selectedLoanDetail;

    document.getElementById("application-detail-empty").hidden = true;
    document.getElementById("application-detail").hidden = false;
    document.getElementById("detail-title").textContent = `${loan.application_code} - ${loan.user_name || "Borrower"}`;
    document.getElementById("detail-subtitle").textContent = `${formatCurrency(loan.amount)} over ${loan.term_months} months`;

    const statusNode = document.getElementById("detail-status");
    statusNode.textContent = formatStatus(loan.status);
    statusNode.className = `role-status-badge ${statusTone(loan.status)}`;

    document.getElementById("detail-meta").innerHTML = `
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
        <span>Duplicate Risk</span>
        <strong>${escapeHtml(`${loan.duplicate_risk_score || 0}/100`)}</strong>
      </div>
    `;

    const documentsHost = document.getElementById("detail-documents");
    const documentsEmpty = document.getElementById("documents-empty-state");
    documentsEmpty.hidden = true;
    documentsHost.innerHTML = documents.length
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
                  <button type="button" class="button button-primary" data-document-id="${doc.id}" data-document-status="verified">Verify</button>
                  <button type="button" class="button role-action-danger" data-document-id="${doc.id}" data-document-status="rejected">Reject</button>
                </div>
              </article>
            `
          )
          .join("")
      : createEmptyState("No documents uploaded yet.");

    document.getElementById("detail-comments").innerHTML = comments.length
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
      : createEmptyState("No internal or user-visible comments yet.");

    renderSelectedLoanContext();
  }

  function renderProfile(account) {
    const avatar = document.querySelector(".profile-avatar strong");
    const title = document.querySelector(".profile-title-row h3");
    const secondary = document.querySelector(".profile-secondary-text");
    const status = document.querySelector(".profile-status-badge");

    if (avatar) {
      avatar.textContent = (getAccountName(account).trim().charAt(0) || "A").toUpperCase();
    }

    if (title) {
      title.textContent = getAccountName(account);
    }

    if (secondary) {
      secondary.textContent = "Loan operations management";
    }

    if (status) {
      status.textContent = "Admin";
      status.className = "profile-status-badge verified";
    }

    document.getElementById("admin-profile-email").textContent = account?.email || "Not available";
    document.getElementById("admin-profile-phone").textContent = account?.phone || "Not available";
    document.getElementById("admin-last-login").textContent = account?.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : "Never";
  }

  async function fetchLoanDetail(loanId) {
    selectedLoanId = loanId;
    renderApplications();
    selectedLoanDetail = await window.CraneApi.adminApplication(loanId);
    renderLoanDetail();
  }

  async function loadDashboard(showToast = false) {
    dashboard = await window.CraneApi.adminDashboard();
    renderSummary();
    renderApplications();
    renderUsers();
    renderNotifications();

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
        await window.CraneAuth.logout("admin-login.html");
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

  document.getElementById("applications-list").addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-loan-id]");
    if (!trigger) {
      return;
    }
    await fetchLoanDetail(trigger.dataset.loanId);
  });

  document.getElementById("applications-preview-list").addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-loan-id]");
    if (!trigger) {
      return;
    }
    setActiveView("applications");
    await fetchLoanDetail(trigger.dataset.loanId);
  });

  document.getElementById("application-detail").addEventListener("click", async (event) => {
    const statusButton = event.target.closest("[data-status-action]");
    if (statusButton && selectedLoanId) {
      const notes = window.prompt("Optional review note:", "") || "";
      await window.CraneApi.updateLoanStatus(selectedLoanId, {
        status: statusButton.dataset.statusAction,
        notes
      });
      window.CraneNotify.success("Application status updated.");
      await loadDashboard();
    }
  });

  document.getElementById("detail-documents").addEventListener("click", async (event) => {
    const documentButton = event.target.closest("[data-document-id]");
    if (!documentButton || !selectedLoanId) {
      return;
    }

    const notes = window.prompt("Document review note:", "") || "";
    await window.CraneApi.verifyDocument(documentButton.dataset.documentId, {
      status: documentButton.dataset.documentStatus,
      notes
    });
    window.CraneNotify.success("Document review updated.");
    await fetchLoanDetail(selectedLoanId);
    await loadDashboard();
  });

  document.getElementById("request-documents-form").addEventListener("submit", async (event) => {
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

  document.getElementById("admin-note-form").addEventListener("submit", async (event) => {
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
    window.CraneNotify.success("Internal note saved.");
    await fetchLoanDetail(selectedLoanId);
  });

  document.getElementById("admin-refresh-btn").addEventListener("click", () => {
    loadDashboard(true);
  });

  document.getElementById("admin-logout-panel-btn").addEventListener("click", () => {
    window.CraneAuth.logout("admin-login.html");
  });

  liveStatusFab?.addEventListener("click", () => {
    setActiveView(selectedLoanId ? "documents" : "applications");
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
  window.addEventListener("crane:loan:created", () => loadDashboard());
  window.addEventListener("crane:loan:updated", () => loadDashboard());
  window.addEventListener("crane:document:updated", () => loadDashboard());
  window.addEventListener("crane:account:status", () => loadDashboard());
  window.addEventListener("crane:session:revoked", () => {
    window.CraneAuth.logout("admin-login.html");
  });

  await window.CraneAuth.bootstrap();
  const account = await window.CraneAuth.requireRole(["admin", "super_admin"], "admin-login.html");
  if (!account) {
    return;
  }

  renderProfile(account);
  window.CraneRealtime.connect();
  await Promise.all([playIntroAnimation(), loadDashboard()]);
});
