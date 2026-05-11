document.addEventListener("DOMContentLoaded", async () => {
  // Play intro animation sequence
  async function playIntroAnimation() {
    const body = document.body;
    const siteIntro = document.querySelector(".site-intro");
    
    // Start animation
    body.classList.remove("intro-loading");
    body.classList.add("intro-playing");
    
    // Wait for animation to complete (1.7s for craneIntroZoom)
    await new Promise(resolve => setTimeout(resolve, 1700));
    
    // Transition to complete state
    body.classList.remove("intro-playing");
    body.classList.add("intro-complete");
    
    // Hide intro overlay
    if (siteIntro) {
      siteIntro.classList.add("is-hidden");
    }
    
    // Wait for fade out
    await new Promise(resolve => setTimeout(resolve, 550));
  }

  const viewOrder = ["overview", "loans", "repay", "score", "get-loan", "referrals"];
  const sections = Array.from(document.querySelectorAll(".view-section"));
  const navLinks = Array.from(document.querySelectorAll("[data-view]"));
  const modal = document.querySelector(".modal-overlay");
  const loginForm = document.getElementById("user-login-form");
  const registerForm = document.getElementById("user-register-form");
  const loanForm = document.getElementById("loan-request-form");
  const feedback = document.querySelector(".submission-feedback");
  let dashboardData = null;

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function setActiveView(viewName) {
    const index = viewOrder.indexOf(viewName);
    if (index === -1) {
      return;
    }
    sections.forEach((section, sectionIndex) => section.classList.toggle("active", sectionIndex === index));
    navLinks.forEach((link) => link.classList.toggle("active", link.dataset.view === viewName));
  }

  function openModal(showRegister = false) {
    modal?.classList.add("active");
    loginForm?.classList.toggle("active", !showRegister);
    registerForm?.classList.toggle("active", showRegister);
  }

  function closeModal() {
    modal?.classList.remove("active");
  }

  const sidebarOverlay = document.querySelector(".sidebar-overlay");
  const dashboardSidebar = document.querySelector(".dashboard-sidebar");
  const contactModal = document.querySelector(".contact-modal-overlay");

  function closeSidebar() {
    sidebarOverlay?.classList.remove("active");
    dashboardSidebar?.classList.remove("active");
  }

  function isAuthenticated() {
    const account = window.CraneAuth?.getAccount?.();
    return Boolean(account && account.role === "user");
  }

  function openContactModal() {
    contactModal?.classList.add("active");
  }

  function updateLiveStatusFAB(status, count = 0) {
    const fab = document.querySelector(".live-status-fab");
    const titleEl = fab?.querySelector(".live-status-title");
    const badgeEl = fab?.querySelector(".live-status-badge");
    
    if (titleEl) {
      titleEl.textContent = status;
    }
    if (badgeEl && count > 0) {
      badgeEl.textContent = count;
      badgeEl.style.display = "block";
    } else if (badgeEl) {
      badgeEl.style.display = "none";
    }
  }

  function setGuestMode() {
    document.querySelector(".welcome-text h1 span").textContent = "Guest";
    document.querySelector(".loan-balance-amount").textContent = "UGX 0";
    document.querySelector(".notification-badge").textContent = "0";
    document.querySelector(".snapshot-badge").textContent = "Awaiting sign in";
    document.querySelectorAll('[data-action="open-login"]').forEach((item) => {
      const labelNode = item.querySelector("span");
      if (labelNode) {
        labelNode.textContent = "Login";
      } else {
        item.textContent = "Login";
      }
      item.onclick = (event) => {
        event.preventDefault();
        openModal(false);
      };
    });
  }

  function renderLoans(loans) {
    const loansList = document.querySelector(".loans-list");
    const loansDetailList = document.querySelector(".loans-detail-list");
    const activeLoans = loans.filter((loan) => ["submitted", "under_review", "verification", "approved", "disbursed"].includes(loan.status));

    loansList.innerHTML = activeLoans.length
      ? activeLoans
          .map(
            (loan) => `
              <article class="loan-card">
                <div class="loan-card-header">
                  <strong>${loan.application_code}</strong>
                  <span>${loan.status.replace(/_/g, " ")}</span>
                </div>
                <p>${formatCurrency(loan.amount)} over ${loan.term_months} months</p>
              </article>
            `
          )
          .join("")
      : '<div class="panel-empty-state compact">No active loan request yet. Submit an application to begin.</div>';

    loansDetailList.innerHTML = loans.length
      ? loans
          .map(
            (loan) => `
              <article class="loan-card detail">
                <div class="loan-card-header">
                  <strong>${loan.application_code}</strong>
                  <span>${loan.status.replace(/_/g, " ")}</span>
                </div>
                <p>${formatCurrency(loan.amount)} • ${loan.purpose.replace(/_/g, " ")}</p>
              </article>
            `
          )
          .join("")
      : '<div class="panel-empty-state compact">Loan history will appear here after your first submission.</div>';

    const loanSelect = document.querySelector(".payment-form select");
    loanSelect.innerHTML = activeLoans.length
      ? activeLoans.map((loan) => `<option value="${loan.id}">${loan.application_code} - ${formatCurrency(loan.amount)}</option>`).join("")
      : '<option value="">No outstanding loans</option>';
  }

  function renderNotifications(notifications) {
    const unread = notifications.filter((item) => !item.read_at).length;
    document.querySelector(".notification-badge").textContent = String(unread);
  }

  function renderOverview(data) {
    const account = data.profile;
    const loans = data.loans || [];
    const notifications = data.notifications || [];
    const activeLoans = loans.filter((loan) => ["submitted", "under_review", "verification", "approved", "disbursed"].includes(loan.status));
    const nextDue = activeLoans[0]?.updated_at ? new Date(activeLoans[0].updated_at).toLocaleDateString() : "Not scheduled";
    const scoreValue = Math.min(760, 520 + activeLoans.length * 28 + (account.verification_status === "verified" ? 70 : 0));

    document.querySelector(".welcome-text h1 span").textContent = account.full_name?.split(" ")[0] || "Member";
    document.querySelector(".loan-balance-amount").textContent = formatCurrency(data.summary.outstandingBalance);
    document.querySelector(".snapshot-badge").textContent = account.verification_status === "verified" ? "Verified account" : "Verification pending";
    document.querySelector(".snapshot-hero h2").textContent = activeLoans.length ? "Your live account snapshot" : "No active loan yet";
    document.querySelector(".snapshot-hero p").textContent = activeLoans.length ? "This view updates immediately when admins review your application." : "Submit a request to start live tracking, document review, and notifications.";
    document.querySelectorAll(".snapshot-item strong")[0].textContent = String(activeLoans.length);
    document.querySelectorAll(".snapshot-item strong")[1].textContent = formatCurrency(data.summary.outstandingBalance);
    document.querySelectorAll(".snapshot-item strong")[2].textContent = nextDue;
    document.querySelectorAll(".snapshot-item strong")[3].textContent = String(data.summary.unreadNotifications);
    document.querySelector(".big-score").textContent = String(scoreValue);
    document.querySelector(".score-grade").textContent = scoreValue > 640 ? "Growing profile" : "Early stage";

    renderLoans(loans);
    renderNotifications(notifications);

    let statusMessage = "Checking your loan application status…";
    if (activeLoans.length > 0) {
      const firstLoan = activeLoans[0];
      statusMessage = `Loan ${firstLoan.application_code}: ${firstLoan.status.replace(/_/g, " ")} • ${formatCurrency(firstLoan.amount)}`;
    } else if (loans.length > 0) {
      statusMessage = `${loans.length} loan(s) in history • Ready for new application`;
    }
    updateLiveStatusFAB(statusMessage, notifications.filter((n) => !n.read_at).length);

    document.querySelectorAll('[data-action="open-login"]').forEach((item) => {
      const labelNode = item.querySelector("span");
      if (labelNode) {
        labelNode.textContent = "Logout";
      } else {
        item.textContent = "Logout";
      }
      item.onclick = async (event) => {
        event.preventDefault();
        await window.CraneAuth.logout("index.html");
      };
    });

    const profileLogoutButton = document.querySelector(".profile-logout-btn");
    if (profileLogoutButton) {
      profileLogoutButton.onclick = () => window.CraneAuth.logout("index.html");
    }
  }

  function renderProfile(account, dashboardData = null) {
    // Update profile header
    const profileAvatar = document.querySelector(".profile-avatar");
    if (profileAvatar) {
      profileAvatar.textContent = account.fullName?.charAt(0)?.toUpperCase() || "U";
    }

    const profileTitle = document.querySelector(".profile-title-row h4");
    if (profileTitle) {
      profileTitle.textContent = account.fullName || "User";
    }

    const profileStatus = document.querySelector(".profile-status-badge");
    if (profileStatus) {
      profileStatus.textContent = account.verificationStatus === "verified" ? "Verified" : "Unverified";
      profileStatus.className = `profile-status-badge ${account.verificationStatus === "verified" ? "verified" : "unverified"}`;
    }

    const profileSecondary = document.querySelector(".profile-secondary-text");
    if (profileSecondary) {
      const regDate = account.profile?.registrationDate
        ? new Date(account.profile.registrationDate).toLocaleDateString()
        : account.createdAt
        ? new Date(account.createdAt).toLocaleDateString()
        : "Unknown";
      profileSecondary.textContent = `Member since ${regDate}`;
    }

    // Update phone number in profile header
    const profilePhone = document.querySelector(".profile-info p:not(.profile-secondary-text)");
    if (profilePhone) {
      const phoneNumber = account.phone || account.profile?.phone;
      profilePhone.textContent = phoneNumber ? phoneNumber : "Phone not available";
    }

    // Update profile summary grid
    const customerIdField = document.querySelectorAll(".profile-summary-card strong")[0];
    if (customerIdField) {
      customerIdField.textContent = account.id?.substring(0, 8) || "--";
    }

    const memberSinceField = document.querySelectorAll(".profile-summary-card strong")[1];
    if (memberSinceField) {
      const regDate = account.profile?.registrationDate
        ? new Date(account.profile.registrationDate).toLocaleDateString()
        : account.createdAt
        ? new Date(account.createdAt).toLocaleDateString()
        : "--";
      memberSinceField.textContent = regDate;
    }

    const creditScoreField = document.querySelectorAll(".profile-summary-card strong")[2];
    if (creditScoreField && dashboardData) {
      const loans = dashboardData.loans || [];
      const activeLoans = loans.filter((loan) => ["submitted", "under_review", "verification", "approved", "disbursed"].includes(loan.status));
      const scoreValue = Math.min(760, 520 + activeLoans.length * 28 + (account.verificationStatus === "verified" ? 70 : 0));
      creditScoreField.textContent = String(scoreValue);
    }

    // Update profile fields
    const phoneField = document.querySelector(".profile-field-card .value");
    if (phoneField) {
      phoneField.textContent = account.phone || account.profile?.phone || "Not provided";
    }

    const emailField = document.querySelectorAll(".profile-field-card .value")[1];
    if (emailField) {
      emailField.textContent = account.email || account.profile?.email || "Not provided";
    }

    const statusField = document.querySelectorAll(".profile-field-card .value")[2];
    if (statusField) {
      statusField.textContent = account.status.charAt(0).toUpperCase() + account.status.slice(1);
    }

    const lastLoginField = document.querySelectorAll(".profile-field-card .value")[3];
    if (lastLoginField) {
      if (account.lastLoginAt) {
        lastLoginField.textContent = new Date(account.lastLoginAt).toLocaleDateString();
      } else {
        lastLoginField.textContent = "Never";
      }
    }

    // Add loan summary information if dashboard data is available
    if (dashboardData) {
      const loans = dashboardData.loans || [];
      const activeLoans = loans.filter((loan) => ["submitted", "under_review", "verification", "approved", "disbursed"].includes(loan.status));
      const totalLoans = loans.length;
      const outstandingBalance = dashboardData.summary?.outstandingBalance || 0;

      // Update or add loan summary section
      let loanSummarySection = document.querySelector(".loan-summary-section");
      if (!loanSummarySection) {
        loanSummarySection = document.createElement("div");
        loanSummarySection.className = "profile-section loan-summary-section";
        loanSummarySection.innerHTML = `
          <h5>Loan Summary</h5>
          <div class="profile-field-grid">
            <div class="profile-field-card">
              <span class="label">Active Loans</span>
              <span class="value">${activeLoans.length}</span>
            </div>
            <div class="profile-field-card">
              <span class="label">Total Loans</span>
              <span class="value">${totalLoans}</span>
            </div>
            <div class="profile-field-card">
              <span class="label">Outstanding Balance</span>
              <span class="value">${formatCurrency(outstandingBalance)}</span>
            </div>
            <div class="profile-field-card">
              <span class="label">Unread Notifications</span>
              <span class="value">${dashboardData.summary?.unreadNotifications || 0}</span>
            </div>
          </div>
        `;
        const supportSection = document.querySelector(".profile-section:last-of-type");
        if (supportSection) {
          supportSection.parentNode.insertBefore(loanSummarySection, supportSection);
        }
      } else {
        // Update existing values
        const activeLoansField = loanSummarySection.querySelectorAll(".value")[0];
        const totalLoansField = loanSummarySection.querySelectorAll(".value")[1];
        const balanceField = loanSummarySection.querySelectorAll(".value")[2];
        const notificationsField = loanSummarySection.querySelectorAll(".value")[3];

        if (activeLoansField) activeLoansField.textContent = activeLoans.length;
        if (totalLoansField) totalLoansField.textContent = totalLoans;
        if (balanceField) balanceField.textContent = formatCurrency(outstandingBalance);
        if (notificationsField) notificationsField.textContent = dashboardData.summary?.unreadNotifications || 0;
      }
    }
  }

  async function loadDashboard(showToast = false) {
    const account = window.CraneAuth.getAccount();
    if (!account || account.role !== "user") {
      setGuestMode();
      return;
    }
    dashboardData = await window.CraneApi.userDashboard();
    renderOverview(dashboardData);
    renderProfile(account, dashboardData);
    if (showToast) {
      window.CraneNotify.success("Dashboard refreshed.");
    }
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const action = link.dataset.action;
      const view = link.dataset.view;

      if (action === "open-contact") {
        event.preventDefault();
        openContactModal();
        return;
      }

      if (!view) {
        return;
      }

      if (view !== "overview" && !isAuthenticated()) {
        event.preventDefault();
        openModal(false);
        return;
      }

      event.preventDefault();
      setActiveView(view);
    });
  });

  document.querySelectorAll(".dashboard-sidebar .menu-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      const view = item.dataset.view;
      const action = item.dataset.action;

      if (action === "open-contact") {
        event.preventDefault();
        closeSidebar();
        openContactModal();
        return;
      }

      if (action === "open-login") {
        event.preventDefault();
        closeSidebar();
        openModal(false);
        return;
      }

      if (view) {
        if (view !== "overview" && !isAuthenticated()) {
          event.preventDefault();
          closeSidebar();
          openModal(false);
          return;
        }

        event.preventDefault();
        closeSidebar();
        setActiveView(view);
      }
    });
  });

  document.querySelector(".btn-apply-now")?.addEventListener("click", () => {
    if (!isAuthenticated()) {
      openModal(false);
      return;
    }
    setActiveView("get-loan");
  });
  document.querySelector(".refresh-btn")?.addEventListener("click", () => loadDashboard(true));
  document.querySelectorAll('[data-quick-box="active"]').forEach((button) => button.addEventListener("click", () => {
    if (!isAuthenticated()) {
      openModal(false);
      return;
    }
    setActiveView("loans");
  }));
  document.querySelectorAll('[data-quick-box="repay"]').forEach((button) => button.addEventListener("click", () => {
    if (!isAuthenticated()) {
      openModal(false);
      return;
    }
    setActiveView("repay");
  }));
  document.querySelectorAll('[data-action="open-login"]').forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    openModal(false);
  }));
  document.querySelectorAll('[data-action="open-contact"]').forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    closeSidebar();
    openContactModal();
  }));
  modal?.querySelector(".modal-close")?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  // Footer menu handlers
  const footerBoxes = document.querySelectorAll(".footer-box");
  if (footerBoxes.length > 0) {
    footerBoxes[0]?.addEventListener("click", () => {
      sidebarOverlay?.classList.toggle("active");
      dashboardSidebar?.classList.toggle("active");
    });
    footerBoxes[1]?.addEventListener("click", () => {
      if (!isAuthenticated()) {
        openModal(false);
        return;
      }
      setActiveView("loans");
    });
    footerBoxes[2]?.addEventListener("click", () => setActiveView("overview"));
    footerBoxes[3]?.addEventListener("click", () => {
      const chatContainer = document.querySelector(".chat-container");
      chatContainer?.classList.toggle("active");
    });
    footerBoxes[4]?.addEventListener("click", () => {
      if (!isAuthenticated()) {
        openModal(false);
        return;
      }
      const profilePanel = document.querySelector(".profile-panel");
      const profileOverlay = document.createElement("div");
      profileOverlay.className = "profile-panel-overlay";
      if (!document.querySelector(".profile-panel-overlay")) {
        document.body.appendChild(profileOverlay);
      }
      profilePanel?.classList.toggle("active");
      document.querySelector(".profile-panel-overlay")?.classList.toggle("active");
    });

    document.querySelector(".chat-close-btn")?.addEventListener("click", () => {
      document.querySelector(".chat-container")?.classList.remove("active");
    });
  }

  // Header notification button
  const notificationButtons = document.querySelectorAll(".header-actions .icon-btn");
  if (notificationButtons.length > 0) {
    notificationButtons[1]?.addEventListener("click", () => {
      if (!isAuthenticated()) {
        openModal(false);
        return;
      }
      document.querySelector(".notification-panel")?.classList.toggle("active");
    });
  }

  // Close profile panel when clicking overlay
  document.addEventListener("click", (e) => {
    const profilePanel = document.querySelector(".profile-panel");
    const profileOverlay = document.querySelector(".profile-panel-overlay");
    if (profileOverlay?.classList.contains("active") && e.target === profileOverlay) {
      profilePanel?.classList.remove("active");
      profileOverlay?.classList.remove("active");
    }
  });

  // Sidebar menu close
  document.querySelector(".sidebar-overlay")?.addEventListener("click", () => {
    document.querySelector(".sidebar-overlay")?.classList.remove("active");
    document.querySelector(".dashboard-sidebar")?.classList.remove("active");
  });

  // Contact modal close
  document.querySelector(".contact-modal-close")?.addEventListener("click", () => {
    document.querySelector(".contact-modal-overlay")?.classList.remove("active");
  });

  // Notification panel close
  document.querySelector(".notification-panel .close-btn")?.addEventListener("click", () => {
    document.querySelector(".notification-panel")?.classList.remove("active");
  });

  // Profile panel close button
  document.querySelector(".profile-panel .close-btn")?.addEventListener("click", () => {
    document.querySelector(".profile-panel")?.classList.remove("active");
    document.querySelector(".profile-panel-overlay")?.classList.remove("active");
  });

  // Profile menu item handlers
  document.addEventListener("click", (event) => {
    const menuItem = event.target.closest(".profile-menu-item");
    if (!menuItem) return;

    const action = menuItem.querySelector("span")?.textContent?.toLowerCase();

    switch (action) {
      case "change pin":
        window.CraneNotify.info("PIN change feature coming soon");
        break;
      case "security settings":
        window.CraneNotify.info("Security settings feature coming soon");
        break;
      case "notification preferences":
        window.CraneNotify.info("Notification preferences feature coming soon");
        break;
      case "help & support":
        // Open contact modal
        document.querySelector(".contact-modal-overlay")?.classList.add("active");
        document.querySelector(".profile-panel")?.classList.remove("active");
        document.querySelector(".profile-panel-overlay")?.classList.remove("active");
        break;
      case "terms & conditions":
        window.CraneNotify.info("Terms & conditions feature coming soon");
        break;
      default:
        break;
    }
  });

  // Contact modal close on overlay click
  document.querySelector(".contact-modal-overlay")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("contact-modal-overlay")) {
      document.querySelector(".contact-modal-overlay")?.classList.remove("active");
    }
  });

  // Live status FAB click handler
  document.querySelector(".live-status-fab")?.addEventListener("click", () => {
    const activeView = document.querySelector(".view-section.active");
    if (activeView?.id === "overview-view") {
      window.CraneNotify.info("Status updated. Check your loan details below.");
    } else {
      setActiveView("overview");
      window.CraneNotify.info("Loading your loan status...");
    }
  });

  document.querySelectorAll(".auth-link").forEach((button) => {
    button.addEventListener("click", () => {
      const label = button.textContent.toLowerCase();
      if (label.includes("create account")) {
        openModal(true);
      } else if (label.includes("back to sign in")) {
        openModal(false);
      }
    });
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = window.CraneForms.normalizePhone(loginForm.elements.phone.value, "+256");
    const pin = loginForm.elements.pin.value.trim();
    try {
      const response = await window.CraneApi.loginUser({ identifier: phone, secret: pin });
      window.CraneAuth.setSession(response);
      closeModal();
      await loadDashboard();
      window.CraneRealtime.connect();
      window.CraneNotify.success("Signed in successfully.");
    } catch (error) {
      window.CraneNotify.error(error.message || "Unable to sign in.");
    }
  });

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fullName = registerForm.elements.fullName.value.trim();
    const email = registerForm.elements.email.value.trim();
    const phone = window.CraneForms.normalizePhone(registerForm.elements.phone.value, "+256");
    const pin = registerForm.elements.pin.value.trim();
    const confirmPin = registerForm.elements.confirmPin.value.trim();
    if (pin !== confirmPin) {
      window.CraneNotify.warning("PIN confirmation does not match.");
      return;
    }

    try {
      const response = await window.CraneApi.registerUser({ fullName, email, phone, pin });
      window.CraneAuth.setSession(response);
      closeModal();
      await loadDashboard();
      window.CraneRealtime.connect();
      window.CraneNotify.success("Account created successfully.");
    } catch (error) {
      window.CraneNotify.error(error.message || "Unable to create account.");
    }
  });

  loanForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.CraneAuth.getAccount()) {
      window.CraneNotify.warning("Please sign in before submitting a loan request.");
      openModal(false);
      return;
    }

    feedback.textContent = "Submitting application...";
    const formData = new FormData(loanForm);
    const payload = {};
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        continue;
      }
      payload[key] = value;
    }

    try {
      const { loan } = await window.CraneApi.applyLoan(payload);
      const documentInputs = Array.from(loanForm.querySelectorAll('input[type="file"]'));
      for (const input of documentInputs) {
        const files = Array.from(input.files || []);
        if (!files.length) {
          continue;
        }
        for (const file of files) {
          feedback.textContent = `Uploading ${input.name.replace(/_/g, " ")}...`;
          const documentType = input.name === "additional_document" ? "additional_document" : input.name;
          await window.CraneApi.uploadLoanDocument(loan.id, documentType, file);
        }
      }

      loanForm.reset();
      feedback.textContent = `Application ${loan.application_code} submitted successfully.`;
      window.CraneNotify.success("Loan request submitted.");
      setActiveView("loans");
      await loadDashboard();
    } catch (error) {
      feedback.textContent = error.message || "Unable to submit loan request.";
      window.CraneNotify.error(error.message || "Submission failed.");
    }
  });

  window.addEventListener("crane:notification:new", () => loadDashboard());
  window.addEventListener("crane:loan:updated", () => loadDashboard());
  window.addEventListener("crane:document:updated", () => loadDashboard());
  window.addEventListener("crane:account:status", (event) => {
    const status = event.detail?.status;
    if (status && status !== "active") {
      window.CraneNotify.warning(`Your account is now ${status}.`);
      window.CraneAuth.logout("index.html");
    }
  });

  // Play intro animation first, then load dashboard
  await playIntroAnimation();
  await window.CraneAuth.bootstrap();
  await loadDashboard();
  window.CraneRealtime.connect();
  setActiveView("overview");
});
