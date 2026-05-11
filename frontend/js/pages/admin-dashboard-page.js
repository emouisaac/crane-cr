document.addEventListener("DOMContentLoaded", async () => {
  let dashboard = null;
  let selectedLoanId = null;

  function statusClass(status) {
    if (["approved", "disbursed", "closed"].includes(status)) return "success";
    if (["rejected"].includes(status)) return "danger";
    if (["verification", "under_review"].includes(status)) return "warning";
    return "";
  }

  function money(value) {
    return new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  async function loadDashboard() {
    dashboard = await window.CraneApi.adminDashboard();
    renderSummary();
    renderApplications();
    renderUsers();
    renderNotifications();
    if (selectedLoanId) {
      await openLoan(selectedLoanId);
    }
  }

  function renderSummary() {
    document.getElementById("summary-total-applications").textContent = dashboard.summary.totalApplications;
    document.getElementById("summary-pending-review").textContent = dashboard.summary.pendingReview;
    document.getElementById("summary-approved-today").textContent = dashboard.summary.approvedToday;
    document.getElementById("summary-active-users").textContent = dashboard.summary.activeUsers;
    document.getElementById("admin-session-name").textContent = window.CraneAuth.getAccount()?.fullName || "";
  }

  function renderApplications() {
    const host = document.getElementById("applications-list");
    host.innerHTML = dashboard.loans.length
      ? dashboard.loans
          .map(
            (loan) => `
              <button type="button" class="application-item ${selectedLoanId === loan.id ? "active" : ""}" data-loan-id="${loan.id}">
                <div class="row-head">
                  <div>
                    <strong>${loan.application_code}</strong>
                    <div class="muted">${loan.user_name}</div>
                  </div>
                  <span class="status-chip ${statusClass(loan.status)}">${loan.status.replace(/_/g, " ")}</span>
                </div>
                <div class="mini-meta">
                  <span>${money(loan.amount)}</span>
                  <span>${loan.term_months} months</span>
                  <span>${loan.purpose.replace(/_/g, " ")}</span>
                </div>
              </button>
            `
          )
          .join("")
      : '<div class="application-item">No applications available.</div>';
  }

  function renderUsers() {
    const host = document.getElementById("users-list");
    host.innerHTML = dashboard.users.slice(0, 8).map((user) => `
      <article class="user-item">
        <strong>${user.full_name}</strong>
        <div class="mini-meta">
          <span>${user.phone || "No phone"}</span>
          <span>${user.status}</span>
        </div>
      </article>
    `).join("");
  }

  function renderNotifications() {
    const host = document.getElementById("admin-notifications-list");
    host.innerHTML = dashboard.notifications.length
      ? dashboard.notifications.slice(0, 10).map((item) => `
        <article class="notification-item">
          <strong>${item.title}</strong>
          <p>${item.message}</p>
        </article>
      `).join("")
      : '<div class="notification-item">No notifications yet.</div>';
  }

  async function openLoan(loanId) {
    selectedLoanId = loanId;
    renderApplications();
    const detail = await window.CraneApi.adminApplication(loanId);
    document.getElementById("application-detail-empty").hidden = true;
    document.getElementById("application-detail").hidden = false;
    document.getElementById("detail-title").textContent = `${detail.loan.application_code} • ${detail.loan.user_name}`;
    document.getElementById("detail-subtitle").textContent = `${money(detail.loan.amount)} over ${detail.loan.term_months} months`;
    document.getElementById("detail-status").textContent = detail.loan.status.replace(/_/g, " ");
    document.getElementById("detail-status").className = `status-chip ${statusClass(detail.loan.status)}`;
    document.getElementById("detail-meta").innerHTML = `
      <div><strong>Email</strong>${detail.loan.user_email || "Not provided"}</div>
      <div><strong>Phone</strong>${detail.loan.user_phone || "Not provided"}</div>
      <div><strong>Purpose</strong>${detail.loan.purpose.replace(/_/g, " ")}</div>
      <div><strong>Duplicate risk</strong>${detail.loan.duplicate_risk_score}/100</div>
    `;
    document.getElementById("detail-documents").innerHTML = detail.documents.length
      ? detail.documents.map((doc) => `
        <article class="document-item">
          <div class="row-head">
            <div>
              <strong>${doc.document_type.replace(/_/g, " ")}</strong>
              <div class="muted">Sharpness ${Number(doc.sharpness_score || 0).toFixed(1)}</div>
            </div>
            <span class="status-chip ${statusClass(doc.status)}">${doc.status.replace(/_/g, " ")}</span>
          </div>
          <div class="document-actions">
            <a class="workspace-btn ghost" href="/api/admin/documents/${doc.id}/file" target="_blank" rel="noopener noreferrer">Open File</a>
            <button type="button" class="workspace-btn secondary" data-document-id="${doc.id}" data-document-status="verified">Verify</button>
            <button type="button" class="workspace-btn danger" data-document-id="${doc.id}" data-document-status="rejected">Reject</button>
          </div>
        </article>
      `).join("")
      : '<div class="document-item">No documents uploaded yet.</div>';
    document.getElementById("detail-comments").innerHTML = detail.comments.length
      ? detail.comments.map((comment) => `
        <article class="comment-item">
          <strong>${comment.author_name} • ${comment.author_role}</strong>
          <p>${comment.message}</p>
        </article>
      `).join("")
      : '<div class="comment-item">No internal or user-visible comments yet.</div>';
  }

  document.getElementById("applications-list").addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-loan-id]");
    if (trigger) {
      await openLoan(trigger.dataset.loanId);
    }
  });

  document.getElementById("application-detail").addEventListener("click", async (event) => {
    const statusButton = event.target.closest("[data-status-action]");
    if (statusButton && selectedLoanId) {
      const notes = window.prompt("Optional review note:", "") || "";
      await window.CraneApi.updateLoanStatus(selectedLoanId, { status: statusButton.dataset.statusAction, notes });
      window.CraneNotify.success("Application status updated.");
      await loadDashboard();
      return;
    }

    const documentButton = event.target.closest("[data-document-id]");
    if (documentButton) {
      const notes = window.prompt("Document review note:", "") || "";
      await window.CraneApi.verifyDocument(documentButton.dataset.documentId, { status: documentButton.dataset.documentStatus, notes });
      window.CraneNotify.success("Document review updated.");
      await openLoan(selectedLoanId);
    }
  });

  document.getElementById("request-documents-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedLoanId) return;
    const message = event.currentTarget.elements.message.value.trim();
    if (!message) return;
    await window.CraneApi.requestDocuments(selectedLoanId, { message });
    event.currentTarget.reset();
    window.CraneNotify.success("Borrower notified.");
    await loadDashboard();
  });

  document.getElementById("admin-note-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedLoanId) return;
    const message = event.currentTarget.elements.message.value.trim();
    if (!message) return;
    await window.CraneApi.addAdminComment(selectedLoanId, { message, visibility: "internal" });
    event.currentTarget.reset();
    window.CraneNotify.success("Internal note saved.");
    await openLoan(selectedLoanId);
  });

  document.getElementById("admin-refresh-btn").addEventListener("click", () => loadDashboard());
  document.getElementById("admin-logout-btn").addEventListener("click", () => window.CraneAuth.logout("admin-login.html"));

  window.addEventListener("crane:notification:new", loadDashboard);
  window.addEventListener("crane:loan:created", loadDashboard);
  window.addEventListener("crane:loan:updated", loadDashboard);
  window.addEventListener("crane:document:updated", loadDashboard);

  await window.CraneAuth.bootstrap();
  const account = await window.CraneAuth.requireRole(["admin", "super_admin"], "admin-login.html");
  if (!account) return;
  window.CraneRealtime.connect();
  await loadDashboard();
});
