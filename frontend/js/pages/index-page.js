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
  const documentUploadFields = loanForm ? Array.from(loanForm.querySelectorAll("[data-document-field]")) : [];
  const cameraModal = document.getElementById("camera-capture-modal");
  const cameraVideo = document.getElementById("camera-capture-video");
  const cameraCanvas = document.getElementById("camera-capture-canvas");
  const cameraStageMessage = document.getElementById("camera-stage-message");
  const cameraTitle = document.getElementById("camera-capture-title");
  const cameraSubtitle = document.getElementById("camera-capture-subtitle");
  const cameraCaptureButton = document.getElementById("camera-capture-btn");
  const cameraUseButton = document.getElementById("camera-use-btn");
  const cameraRetakeButton = document.getElementById("camera-retake-btn");
  const notificationPanel = document.querySelector(".notification-panel");
  const notificationList = notificationPanel?.querySelector(".notifications-list");
  const loanSubmitButton = loanForm?.querySelector('button[type="submit"]');
  const loanHelpText = loanForm?.querySelector(".form-help-text");
  const statusPillButtons = Array.from(document.querySelectorAll(".loan-status-pills .status-pill"));
  const paymentLoanSelect = document.querySelector("[data-payment-loan-select]");
  const partialPaymentInput = document.querySelector("[data-payment-partial-input]");
  const partialPaymentGroup = partialPaymentInput?.closest(".form-group");
  const paymentStatusNote = document.querySelector("[data-payment-status-note]");
  const paymentInstallmentDue = document.querySelector("[data-payment-installment-due]");
  const paymentServiceFee = document.querySelector("[data-payment-service-fee]");
  const paymentTotalToday = document.querySelector("[data-payment-total-today]");
  const earlyOutstandingPrincipal = document.querySelector("[data-early-outstanding-principal]");
  const earlyPayoffBenefit = document.querySelector("[data-early-payoff-benefit]");
  const earlyTotalPayoff = document.querySelector("[data-early-total-payoff]");
  const earlyRepayButton = document.querySelector("[data-early-repay-button]");
  const offerAmountValue = document.querySelector(".offer-amount");
  const offerSlider = document.querySelector("[data-offer-slider]");
  const offerInstallmentValue = document.querySelector("[data-offer-installment]");
  const offerRateCaption = document.querySelector("[data-offer-rate-caption]");
  const offerRateLiveValue = document.querySelector("[data-offer-rate-live]");
  const activeViewStorageKey = "crane.activeView";
  const loanDraftStorageKey = "crane.loanRequestDraft";
  const documentUploadState = new Map();
  let dashboardData = null;
  let dashboardRefreshTimer = null;
  let currentLoanFilter = "all";
  let activeCameraField = null;
  let activeCameraStream = null;
  let capturedCameraBlob = null;
  let hasAttemptedDocumentValidation = false;
  const processingLoanStatuses = new Set(["submitted", "under_review", "verification"]);
  const existingLoanStatuses = new Set(["approved", "disbursed"]);
  const liveLoanStatuses = new Set([...processingLoanStatuses, ...existingLoanStatuses]);
  const repayableLoanStatuses = new Set(["approved", "disbursed"]);
  const completedLoanStatuses = new Set(["closed"]);
  const reapplicationDateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });
  const defaultLoanHelpText = "Status will be updated once admin review begins.";
  const defaultLoanInterestRate = 17;
  const promoOffer = {
    minAmount: 100000,
    maxAmount: 5000000,
    minRatePercent: 9,
    maxRatePercent: 17,
    termMonths: 12
  };
  const popularDistricts = [
    "Kampala",
    "Wakiso",
    "Mukono",
    "Jinja City",
    "Mbarara City",
    "Gulu City",
    "Mbale City",
    "Masaka City",
    "Lira City",
    "Hoima City",
    "Fort Portal City",
    "Arua City"
  ];

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function formatOfferCurrency(value) {
    return `UGX ${Number(value || 0).toLocaleString("en-UG", { maximumFractionDigits: 0 })}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createEmptyState(message) {
    return `<div class="panel-empty-state compact">${escapeHtml(message)}</div>`;
  }

  function getDocumentFieldLabel(field) {
    return field?.querySelector("label")?.textContent?.trim() || "document";
  }

  function getDocumentInput(field) {
    return field?.querySelector('input[type="file"]') || null;
  }

  function getStoredDocumentFiles(fieldOrName) {
    const name = typeof fieldOrName === "string" ? fieldOrName : getDocumentInput(fieldOrName)?.name;
    return name ? documentUploadState.get(name) || [] : [];
  }

  function setStoredDocumentFiles(field, files, options = {}) {
    const input = getDocumentInput(field);
    if (!input?.name) {
      return;
    }

    const append = Boolean(options.append && field.dataset.multiple === "true");
    const nextFiles = append ? [...getStoredDocumentFiles(input.name), ...files] : [...files];
    documentUploadState.set(input.name, nextFiles);
    updateDocumentUploadStatus(field);
  }

  function clearStoredDocumentFiles(field) {
    const input = getDocumentInput(field);
    if (!input?.name) {
      return;
    }

    documentUploadState.delete(input.name);
    input.value = "";
    updateDocumentUploadStatus(field);
  }

  function updateDocumentUploadStatus(field) {
    const input = getDocumentInput(field);
    const statusNode = field?.querySelector("[data-upload-status]");
    if (!input || !statusNode) {
      return;
    }

    const files = getStoredDocumentFiles(input.name);
    const isRequired = field.dataset.required === "true";
    const hasFiles = files.length > 0;

    field.classList.toggle("has-file", hasFiles);
    field.classList.toggle("is-required-missing", hasAttemptedDocumentValidation && isRequired && !hasFiles);

    if (!hasFiles) {
      statusNode.textContent = isRequired ? "Required: add a clear image before submitting." : "No file selected yet.";
      return;
    }

    if (files.length === 1) {
      statusNode.textContent = `Ready: ${files[0].name}`;
      return;
    }

    statusNode.textContent = `Ready: ${files.length} files selected`;
  }

  function initializeDocumentUploadState() {
    documentUploadFields.forEach((field) => updateDocumentUploadStatus(field));
  }

  function resetDocumentUploadState() {
    hasAttemptedDocumentValidation = false;
    documentUploadState.clear();
    documentUploadFields.forEach((field) => {
      const input = getDocumentInput(field);
      if (input) {
        input.value = "";
      }
      updateDocumentUploadStatus(field);
    });
  }

  function validateDocumentUploads() {
    hasAttemptedDocumentValidation = true;
    documentUploadFields.forEach((field) => updateDocumentUploadStatus(field));
    const missingFields = documentUploadFields.filter((field) => field.dataset.required === "true" && getStoredDocumentFiles(field).length === 0);
    if (!missingFields.length) {
      return true;
    }

    const labels = missingFields.map((field) => getDocumentFieldLabel(field));
    const message = `Add the required document photo${labels.length > 1 ? "s" : ""}: ${labels.join(", ")}.`;
    if (feedback) {
      feedback.textContent = message;
    }
    window.CraneNotify.warning(message);
    missingFields[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  function stopCameraStream() {
    if (!activeCameraStream) {
      return;
    }

    activeCameraStream.getTracks().forEach((track) => track.stop());
    activeCameraStream = null;
  }

  function resetCameraStageForLiveFeed() {
    if (cameraCanvas) {
      cameraCanvas.hidden = true;
    }
    if (cameraVideo) {
      cameraVideo.hidden = false;
    }
    if (cameraStageMessage) {
      cameraStageMessage.hidden = true;
      cameraStageMessage.textContent = "";
    }
    if (cameraCaptureButton) {
      cameraCaptureButton.hidden = false;
      cameraCaptureButton.disabled = false;
    }
    if (cameraRetakeButton) {
      cameraRetakeButton.hidden = true;
    }
    if (cameraUseButton) {
      cameraUseButton.hidden = true;
    }
  }

  function showCameraStageMessage(message) {
    if (cameraStageMessage) {
      cameraStageMessage.textContent = message;
      cameraStageMessage.hidden = false;
    }
    if (cameraVideo) {
      cameraVideo.hidden = true;
      cameraVideo.srcObject = null;
    }
    if (cameraCanvas) {
      cameraCanvas.hidden = true;
    }
    if (cameraCaptureButton) {
      cameraCaptureButton.disabled = true;
    }
    if (cameraRetakeButton) {
      cameraRetakeButton.hidden = true;
    }
    if (cameraUseButton) {
      cameraUseButton.hidden = true;
    }
  }

  async function startCameraStreamForField(field) {
    if (!navigator.mediaDevices?.getUserMedia) {
      showCameraStageMessage("This browser cannot open an in-app camera here. Use Upload photo instead.");
      return;
    }

    stopCameraStream();
    resetCameraStageForLiveFeed();
    capturedCameraBlob = null;

    const facingMode = field?.dataset.cameraFacing === "user" ? "user" : "environment";

    try {
      activeCameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      if (cameraVideo) {
        cameraVideo.srcObject = activeCameraStream;
        await cameraVideo.play();
      }
    } catch (_error) {
      showCameraStageMessage("Camera access was blocked or unavailable. You can still use Upload photo from this form.");
    }
  }

  async function openCameraModalForField(field) {
    activeCameraField = field;
    capturedCameraBlob = null;

    if (cameraTitle) {
      cameraTitle.textContent = `Capture ${getDocumentFieldLabel(field).toLowerCase()}`;
    }
    if (cameraSubtitle) {
      cameraSubtitle.textContent = field.dataset.multiple === "true"
        ? "Take one supporting image at a time. Each accepted photo is added directly to this application."
        : "The camera opens inside Crane Credit so you can attach the image directly to this application.";
    }

    if (cameraModal) {
      cameraModal.hidden = false;
      requestAnimationFrame(() => cameraModal.classList.add("active"));
    }

    await startCameraStreamForField(field);
  }

  function closeCameraModal() {
    stopCameraStream();
    activeCameraField = null;
    capturedCameraBlob = null;

    if (cameraVideo) {
      cameraVideo.pause();
      cameraVideo.srcObject = null;
      cameraVideo.hidden = false;
    }
    if (cameraCanvas) {
      cameraCanvas.hidden = true;
    }
    if (cameraStageMessage) {
      cameraStageMessage.hidden = true;
      cameraStageMessage.textContent = "";
    }
    if (cameraCaptureButton) {
      cameraCaptureButton.hidden = false;
      cameraCaptureButton.disabled = false;
    }
    if (cameraRetakeButton) {
      cameraRetakeButton.hidden = true;
    }
    if (cameraUseButton) {
      cameraUseButton.hidden = true;
    }
    if (cameraModal) {
      cameraModal.classList.remove("active");
      window.setTimeout(() => {
        if (!cameraModal.classList.contains("active")) {
          cameraModal.hidden = true;
        }
      }, 220);
    }
  }

  function capturePhotoFromCamera() {
    if (!activeCameraField || !cameraVideo || !cameraCanvas || !cameraVideo.videoWidth || !cameraVideo.videoHeight) {
      return;
    }

    const context = cameraCanvas.getContext("2d");
    if (!context) {
      showCameraStageMessage("The captured frame could not be processed. Use Upload photo instead.");
      return;
    }

    cameraCanvas.width = cameraVideo.videoWidth;
    cameraCanvas.height = cameraVideo.videoHeight;
    context.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);

    cameraCanvas.toBlob((blob) => {
      if (!blob) {
        showCameraStageMessage("The captured frame could not be saved. Use Upload photo instead.");
        return;
      }

      capturedCameraBlob = blob;
      stopCameraStream();

      cameraVideo.hidden = true;
      cameraCanvas.hidden = false;
      if (cameraCaptureButton) {
        cameraCaptureButton.hidden = true;
      }
      if (cameraRetakeButton) {
        cameraRetakeButton.hidden = false;
      }
      if (cameraUseButton) {
        cameraUseButton.hidden = false;
      }
    }, "image/jpeg", 0.92);
  }

  function confirmCapturedPhoto() {
    if (!activeCameraField || !capturedCameraBlob) {
      return;
    }

    const input = getDocumentInput(activeCameraField);
    if (!input?.name) {
      closeCameraModal();
      return;
    }

    const extensionSafeName = input.name.replace(/[^a-z0-9_]+/gi, "-");
    const file = new File([capturedCameraBlob], `${extensionSafeName}-${Date.now()}.jpg`, { type: "image/jpeg" });
    setStoredDocumentFiles(activeCameraField, [file], { append: activeCameraField.dataset.multiple === "true" });
    closeCameraModal();
  }

  function createUniqueOptions(values = []) {
    return values.filter((value, index, list) => value && list.indexOf(value) === index);
  }

  function flattenOptionGroup(group = {}) {
    return createUniqueOptions(Object.values(group).flat().filter(Boolean));
  }

  function formatTitleCase(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(" ");
  }

  function prioritizeDistrictOptions() {
    const districtList = document.getElementById("uganda-districts");
    if (!districtList) {
      return;
    }

    const existingOptions = Array.from(districtList.querySelectorAll("option"))
      .map((option) => option.value)
      .filter(Boolean);
    const seenKeys = new Set();
    const sortedOptions = [...popularDistricts, ...existingOptions].filter((option) => {
      const key = normalizeLocationKey(option);
      if (!key || seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
      return true;
    });

    districtList.innerHTML = sortedOptions.map((option) => `<option value="${escapeHtml(option)}"></option>`).join("");
  }

  function buildFallbackLocalityConfig(districtValue) {
    const districtLabel = formatTitleCase(districtValue);
    if (!districtLabel) {
      return null;
    }

    const districtKey = normalizeLocationKey(districtLabel);
    const isCityAddress = cityDistrictNames.has(districtKey) || districtKey.endsWith(" city");
    const districtBase = districtLabel.replace(/\s+City$/i, "").trim();
    const subcounties = isCityAddress
      ? ["Central Division", "Northern Division", "Southern Division", "Eastern Division", "Western Division"]
      : [`${districtBase} Town Council`, `${districtBase} Central`, `${districtBase} East`, `${districtBase} North`, `${districtBase} South`];

    const villagesBySubcounty = {};
    const streetsByVillage = {};

    subcounties.forEach((subcounty) => {
      const villageOptions = isCityAddress
        ? [`${districtBase} Central Zone`, `${districtBase} Market Zone`, `${districtBase} Residential Zone`]
        : [`${districtBase} Trading Centre`, `${subcounty} Zone A`, `${subcounty} Zone B`];
      villagesBySubcounty[normalizeLocationKey(subcounty)] = villageOptions;

      villageOptions.forEach((village) => {
        streetsByVillage[normalizeLocationKey(village)] = isCityAddress
          ? ["Main Street", "Market Street", "Station Road", "Church Lane"]
          : ["Main Road", "Market Road", "School Lane", "Church Road"];
      });
    });

    return {
      subcounties,
      parishes: villagesBySubcounty,
      villages: streetsByVillage
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getPromoOfferState() {
    const { minAmount, maxAmount, minRatePercent, maxRatePercent, termMonths } = promoOffer;
    const currentAmount = clamp(Number(offerSlider?.value || maxAmount), minAmount, maxAmount);
    const ratio = (currentAmount - minAmount) / Math.max(maxAmount - minAmount, 1);
    const ratePercent = Math.round((minRatePercent + ratio * (maxRatePercent - minRatePercent)) * 10) / 10;
    return {
      amount: currentAmount,
      ratePercent,
      termMonths
    };
  }

  function renderPromoOffer() {
    const { amount, ratePercent, termMonths } = getPromoOfferState();
    const monthlyPrincipal = amount / Math.max(termMonths, 1);
    const monthlyInterest = (amount * ratePercent) / 100;
    const monthlyInstallment = Math.round(monthlyPrincipal + monthlyInterest);

    if (offerAmountValue) {
      offerAmountValue.textContent = formatOfferCurrency(amount);
    }
    if (offerInstallmentValue) {
      offerInstallmentValue.textContent = formatOfferCurrency(monthlyInstallment);
    }
    if (offerRateCaption) {
      offerRateCaption.textContent = `${ratePercent}% monthly for ${termMonths} months`;
    }
    if (offerRateLiveValue) {
      offerRateLiveValue.textContent = `${ratePercent}%`;
    }
  }

  function addDays(dateValue, days) {
    const date = new Date(dateValue);
    date.setDate(date.getDate() + days);
    return date;
  }

  function getLoanApplicationAccessState(account, loans = []) {
    if (account?.status && account.status !== "active") {
      return {
        canApply: false,
        message: "Your account is suspended. Contact support to restore loan access."
      };
    }

    const processingLoan = loans.find((loan) => processingLoanStatuses.has(loan.status));
    if (processingLoan) {
      return {
        canApply: false,
        message: processingLoan.application_code
          ? `Loan ${processingLoan.application_code} is still being processed.`
          : "You already have a loan request being processed."
      };
    }

    const existingLoan = loans.find((loan) => existingLoanStatuses.has(loan.status));
    if (existingLoan) {
      return {
        canApply: false,
        message: existingLoan.application_code
          ? `Loan ${existingLoan.application_code} is still active. Complete it before applying again.`
          : "You already have an active loan. Complete it before applying again."
      };
    }

    const latestRejectedLoan = loans.find((loan) => loan.status === "rejected");
    if (latestRejectedLoan) {
      const rejectedAt = latestRejectedLoan.closed_at || latestRejectedLoan.updated_at || latestRejectedLoan.submitted_at;
      if (rejectedAt) {
        const eligibleAt = addDays(rejectedAt, 7);
        if (eligibleAt > new Date()) {
          return {
            canApply: false,
            message: latestRejectedLoan.application_code
              ? `Loan ${latestRejectedLoan.application_code} was rejected. You can apply again on ${reapplicationDateFormatter.format(eligibleAt)}.`
              : `Your last loan request was rejected. You can apply again on ${reapplicationDateFormatter.format(eligibleAt)}.`
          };
        }
      }
    }

    return { canApply: true, message: "" };
  }

  function updateLoanApplicationAvailability(account, loans = []) {
    if (!loanSubmitButton) {
      return;
    }

    const accessState = getLoanApplicationAccessState(account, loans);
    loanSubmitButton.disabled = !accessState.canApply;
    loanSubmitButton.textContent = accessState.canApply ? "Submit request" : "Application unavailable";

    if (loanHelpText) {
      loanHelpText.textContent = accessState.canApply ? defaultLoanHelpText : accessState.message;
    }

    if (!feedback) {
      return;
    }

    if (accessState.canApply) {
      if (feedback.dataset.lockReason) {
        feedback.textContent = "";
        delete feedback.dataset.lockReason;
      }
      return;
    }

    feedback.textContent = accessState.message;
    feedback.dataset.lockReason = accessState.message;
  }

  function setActiveView(viewName) {
    const index = viewOrder.indexOf(viewName);
    if (index === -1) {
      return;
    }
    sections.forEach((section, sectionIndex) => section.classList.toggle("active", sectionIndex === index));
    navLinks.forEach((link) => link.classList.toggle("active", link.dataset.view === viewName));
    writeSessionValue(activeViewStorageKey, viewName);
  }

  function readSessionValue(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function writeSessionValue(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (_error) {
      // Ignore storage write failures and keep the current in-memory state.
    }
  }

  function removeSessionValue(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (_error) {
      // Ignore storage removal failures.
    }
  }

  function getInitialView() {
    const storedView = readSessionValue(activeViewStorageKey);
    if (!storedView || !viewOrder.includes(storedView)) {
      return "overview";
    }
    if (storedView !== "overview" && !isAuthenticated()) {
      return "overview";
    }
    return storedView;
  }

  function serializeLoanDraft() {
    if (!loanForm) {
      return null;
    }

    return Array.from(loanForm.elements).reduce((draft, field) => {
      if (!field?.name || field.type === "file") {
        return draft;
      }
      draft[field.name] = field.value;
      return draft;
    }, {});
  }

  function persistLoanDraft() {
    const draft = serializeLoanDraft();
    if (!draft) {
      return;
    }
    writeSessionValue(loanDraftStorageKey, JSON.stringify(draft));
  }

  function clearLoanDraft() {
    removeSessionValue(loanDraftStorageKey);
  }

  function restoreLoanDraft() {
    if (!loanForm) {
      return;
    }

    const rawDraft = readSessionValue(loanDraftStorageKey);
    if (!rawDraft) {
      return;
    }

    try {
      const draft = JSON.parse(rawDraft);
      if (!draft || typeof draft !== "object") {
        return;
      }

      const localityFieldNames = new Set(["district", "subcounty", "parish", "village"]);
      Object.entries(draft).forEach(([name, value]) => {
        if (localityFieldNames.has(name)) {
          return;
        }
        const field = loanForm.elements[name];
        if (field && field.type !== "file") {
          field.value = value ?? "";
        }
      });

      if (loanForm.elements.district) {
        loanForm.elements.district.value = draft.district || "";
      }
      populateLocalitySuggestions({ resetChildren: false });

      if (loanForm.elements.subcounty) {
        loanForm.elements.subcounty.value = draft.subcounty || "";
      }
      populateLocalitySuggestions({ resetChildren: false });

      if (loanForm.elements.parish) {
        loanForm.elements.parish.value = draft.parish || "";
      }
      populateLocalitySuggestions({ resetChildren: false });

      if (loanForm.elements.village) {
        loanForm.elements.village.value = draft.village || "";
      }

      updateLoanApplicationRules();
    } catch (_error) {
      clearLoanDraft();
    }
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

  function scheduleDashboardRefresh(showToast = false) {
    clearTimeout(dashboardRefreshTimer);
    dashboardRefreshTimer = setTimeout(() => {
      loadDashboard(showToast).catch((error) => {
        window.CraneNotify.error(error.message || "Unable to refresh your dashboard.");
      });
    }, 120);
  }

  const cityDistrictNames = new Set([
    "kampala",
    "arua city",
    "gulu city",
    "hoima city",
    "jinja city",
    "lira city",
    "masaka city",
    "mbale city",
    "mbarara city",
    "soroti city",
    "fort portal city"
  ]);

  const localityDirectory = {
    kampala: {
      subcounties: ["Central Division", "Kawempe Division", "Makindye Division", "Nakawa Division", "Rubaga Division"],
      parishes: {
        "central division": ["Nakasero", "Old Kampala", "Mengo", "Civic Centre"],
        "kawempe division": ["Bwaise", "Kanyanya", "Kyebando", "Mulago"],
        "makindye division": ["Kibuye", "Kansanga", "Nsambya", "Katwe"],
        "nakawa division": ["Naguru", "Ntinda", "Kireka", "Najjera"],
        "rubaga division": ["Mengo", "Nateete", "Lungujja", "Kasubi"]
      },
      villages: {
        nakasero: ["Upper Nakasero", "Lower Nakasero", "Akii Bua Road"],
        "old kampala": ["Old Kampala", "Namirembe", "Gaddafi Road"],
        mengo: ["Mengo", "Kabaka Anjagala", "Balintuma"],
        civic: ["Parliament Avenue", "Constitution Square"],
        bwaise: ["Bwaise I", "Bwaise II", "Bwaise III"],
        kanyanya: ["Kanyanya East", "Kanyanya West", "Kubiri"],
        kyebando: ["Kyebando Central", "Kisalosalo", "Kalerwe"],
        mulago: ["Mulago I", "Mulago II", "Makerere North"],
        kibuye: ["Kibuye I", "Kibuye II", "Ndejje"],
        kansanga: ["Kansanga Central", "Lukuli", "Ggaba Road"],
        nsambya: ["Nsambya Central", "Kabalagala", "Muyenga"],
        katwe: ["Katwe I", "Katwe II", "Wankulukuku"],
        naguru: ["Naguru Go-down", "Naguru East", "Bugolobi"],
        ntinda: ["Ntinda", "Minister's Village", "Naguru Hill"],
        kireka: ["Kireka A", "Kireka B", "Kamuli"],
        najjera: ["Kiwatule", "Najjera I", "Najjera II"],
        nateete: ["Nateete", "Mutundwe", "Lusaze"],
        lungujja: ["Lungujja", "Lubya", "Busega"],
        kasubi: ["Kasubi", "Makerere Kikoni", "Kawaala"]
      }
    },
    wakiso: {
      subcounties: ["Busukuma", "Kakiri", "Kasangati", "Katabi", "Kira", "Kyadondo", "Makindye-Ssabagabo", "Nansana", "Nangabo"],
      parishes: {
        busukuma: ["Busiika", "Kiryagonja", "Lugoba"],
        kakiri: ["Kakiri", "Buloba", "Mpunge"],
        kasangati: ["Kasangati", "Gayaza", "Wampeewo"],
        katabi: ["Lunyo", "Kitoro", "Kawuku"],
        kira: ["Kira", "Bweyogerere", "Nabweru"],
        kyadondo: ["Nabweru", "Maganjo", "Nansana East"],
        "makindye-ssabagabo": ["Bunamwaya", "Salaama", "Sseguku"],
        nansana: ["Nansana East", "Nansana West", "Gganda"],
        nangabo: ["Kiteezi", "Kanyanya", "Matugga"]
      },
      villages: {
        kakiri: ["Kakiri Town", "Mayanja", "Luwunga"],
        buloba: ["Buloba Town", "Bujjuko", "Namirembe"],
        kasangati: ["Kasangati Town", "Kungu", "Kulambiro"],
        gayaza: ["Gayaza Town", "Manyangwa", "Nakwero"],
        lunyo: ["Lunyo", "Abaita Ababiri", "Lweza"],
        kitoro: ["Kitoro", "Entebbe Central", "Kitubulu"],
        kawuku: ["Kawuku", "Bwerenga", "Lweza"],
        kira: ["Kira Town", "Mulawa", "Kyaliwajjala"],
        bweyogerere: ["Bweyogerere", "Butto", "Namugongo"],
        bunamwaya: ["Bunamwaya", "Zana", "Lubowa"],
        sseguku: ["Sseguku", "Namasuba", "Katale"],
        nansana: ["Nansana Central", "Wamala", "Gganda"]
      }
    },
    mukono: {
      subcounties: ["Goma", "Koome", "Mpatta", "Mukono Central", "Nama", "Nakifuma", "Ntenjeru", "Seeta", "Ssabagabo"],
      parishes: {
        goma: ["Kyungu", "Mbalala", "Namanve"],
        "mukono central": ["Central", "Namumira", "Ntaawo"],
        nama: ["Nama", "Wantoni", "Njeru"],
        nakifuma: ["Nakifuma", "Kasawo", "Kojja"],
        ntenjeru: ["Ntenjeru", "Mpunge", "Mpatta"],
        seeta: ["Seeta", "Bajjo", "Namugongo"]
      },
      villages: {
        kyungu: ["Kyungu", "Namalere", "Kirangira"],
        mbalala: ["Mbalala", "Sonde", "Nabusugwe"],
        central: ["Mukono Central", "Ntaawo", "Buguju"],
        nama: ["Nama", "Nakisunga", "Wantoni"],
        seeta: ["Seeta", "Ggulu", "Bajjo"]
      }
    },
    "jinja city": {
      subcounties: ["Bugembe", "Jinja Central", "Mafubira", "Mpumudde", "Walukuba"],
      parishes: {
        bugembe: ["Bugembe", "Wairaka", "Kimaka"],
        "jinja central": ["Old Kampala", "Main Street", "Nalufenya"],
        mafubira: ["Mafubira", "Masese", "Buwenge"],
        mpumudde: ["Mpumudde", "Bashir", "Buwenge"],
        walukuba: ["Walukuba", "Masese I", "Masese II"]
      },
      villages: {
        bugembe: ["Bugembe Town", "Wairaka", "Kimaka"],
        nalufenya: ["Nalufenya", "Nile Crescent", "Senior Quarters"],
        walukuba: ["Walukuba", "Masese I", "Masese II"]
      }
    },
    "mbarara city": {
      subcounties: ["Biharwe", "Kakoba", "Kamukuzi", "Kisenyi", "Nyamitanga"],
      parishes: {
        biharwe: ["Biharwe", "Bwizibwera", "Kibingo"],
        kakoba: ["Kakoba", "Kakiika", "Nyamityobora"],
        kamukuzi: ["Kamukuzi", "Katete", "Ruti"],
        kisenyi: ["Kisenyi", "Kiyanja", "Rwemigina"],
        nyamitanga: ["Nyamitanga", "Ruti", "Kakika"]
      },
      villages: {
        kakoba: ["Kakoba", "Nyamityobora", "Boma"],
        kamukuzi: ["Kamukuzi", "Katete", "Ruti"],
        nyamitanga: ["Nyamitanga", "Rwemigina", "Biharwe"]
      }
    },
    "gulu city": {
      subcounties: ["Bardege-Layibi", "Laroo-Pece", "Makindye", "Patiko", "Pabo"],
      parishes: {
        "bardege-layibi": ["Bardege", "Layibi", "Kasubi"],
        "laroo-pece": ["Laroo", "Pece", "Limu"],
        makindye: ["Makindye", "Pageya", "Iriaga"]
      },
      villages: {
        bardege: ["Bardege A", "Bardege B", "Bardege Cell"],
        layibi: ["Layibi Central", "Layibi Techo", "Layibi East"],
        laroo: ["Laroo Central", "Laroo West", "Laroo East"],
        pece: ["Pece Prison", "Pece Acoyo", "Pece Vanguard"]
      }
    },
    "mbale city": {
      subcounties: ["Industrial Division", "Northern Division", "Wanale Division"],
      parishes: {
        "industrial division": ["Mission", "Busamaga", "Namatala"],
        "northern division": ["Namakwekwe", "Nabuyonga", "Busoba"],
        "wanale division": ["Nkoma", "Busiu", "Bufumbo"]
      },
      villages: {
        mission: ["Mission Cell", "Senior Quarters", "Hospital Cell"],
        namatala: ["Namatala", "Mooni", "Busamaga"],
        namakwekwe: ["Namakwekwe", "Busoba", "Nabuyonga"]
      }
    },
    "masaka city": {
      subcounties: ["Kimaanya-Kabonera", "Nyendo-Mukungwe"],
      parishes: {
        "kimaanya-kabonera": ["Kimaanya", "Kabonera", "Ssenyange"],
        "nyendo-mukungwe": ["Nyendo", "Mukungwe", "Ndegeya"]
      },
      villages: {
        kimaanya: ["Kimaanya", "Ssenyange", "Bwala Hill"],
        nyendo: ["Nyendo", "Kijjabwemi", "Kitovu"],
        mukungwe: ["Mukungwe", "Bwala", "Ndegeya"]
      }
    }
  };

  function setGroupVisibility(groups, shouldShow, requiredFields = []) {
    groups.forEach((group) => {
      group.hidden = !shouldShow;
      group.querySelectorAll("input, select, textarea").forEach((field) => {
        const isRequired = shouldShow && requiredFields.includes(field.name);
        field.disabled = !shouldShow;
        field.required = isRequired;
        if (!shouldShow) {
          field.value = "";
        }
      });
    });
  }

  function setFieldRequired(field, required) {
    if (!field) {
      return;
    }
    field.required = required;
    field.disabled = false;
  }

  function setDocumentRequirement(groupName, { required, label, hint }) {
    const group = loanForm?.querySelector(`[data-document-group="${groupName}"]`);
    const input = group?.querySelector('input[type="file"]');
    const labelNode = group?.querySelector("label");
    if (!group || !input || !labelNode) {
      return;
    }

    input.required = required;
    labelNode.textContent = required ? `${label}${hint ? ` (${hint})` : ""}` : label;
  }

  function updateSelectOptions(field, options = [], placeholder = "Select an option") {
    if (!field) {
      return;
    }

    const normalizedOptions = Array.isArray(options) ? options : [];
    const currentValue = field.value;
    const optionMarkup = normalizedOptions
      .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
      .join("");

    field.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${optionMarkup}`;
    field.disabled = normalizedOptions.length === 0;
    field.value = normalizedOptions.includes(currentValue) ? currentValue : "";
  }

  function normalizeLocationKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getLocalityConfig() {
    const districtValue = loanForm?.elements?.district?.value;
    return localityDirectory[normalizeLocationKey(districtValue)] || buildFallbackLocalityConfig(districtValue);
  }

  function getLocalityOptions(group, value) {
    return group?.[normalizeLocationKey(value)] || [];
  }

  function populateLocalitySuggestions({ resetChildren = false } = {}) {
    if (!loanForm) {
      return;
    }

    const config = getLocalityConfig();
    const subcountyField = loanForm.elements.subcounty;
    const parishField = loanForm.elements.parish;
    const villageField = loanForm.elements.village;

    if (!config) {
      updateSelectOptions(subcountyField, [], "Select your sub-county / town council");
      updateSelectOptions(parishField, [], "Select your village / zone");
      updateSelectOptions(villageField, [], "Select your street / plot");
      return;
    }

    const subcountyOptions = config.subcounties || [];

    if (resetChildren) {
      if (subcountyField) subcountyField.value = "";
      if (parishField) parishField.value = "";
      if (villageField) villageField.value = "";
    }

    updateSelectOptions(subcountyField, subcountyOptions, "Select your sub-county / town council");

    const activeSubcounty = subcountyField?.value || "";
    const parishOptions = activeSubcounty
      ? getLocalityOptions(config.parishes, activeSubcounty)
      : flattenOptionGroup(config.parishes);

    if (resetChildren) {
      if (parishField) parishField.value = "";
      if (villageField) villageField.value = "";
    }

    updateSelectOptions(parishField, parishOptions, "Select your village / zone");

    const activeParish = parishField?.value || "";
    const villageOptions = activeParish
      ? getLocalityOptions(config.villages, activeParish)
      : flattenOptionGroup(config.villages);
    updateSelectOptions(villageField, villageOptions, "Select your street / plot");
  }

  function updateAddressLabel() {
    return;
  }

  function updateApplicantCategoryCopy(category, isEmploymentCategory, isBusinessCategory, isOtherCategory) {
    const sectionHeading = document.getElementById("employment-section-heading");
    const employmentNameLabel = document.getElementById("employment-name-label");
    const employmentPositionLabel = document.getElementById("employment-position-label");
    const employmentDurationLabel = document.getElementById("employment-duration-label");
    const businessNameLabel = document.getElementById("business-name-label");
    const businessCategoryLabel = document.getElementById("business-category-label");
    const businessRegistrationLabel = document.getElementById("business-registration-label");

    if (sectionHeading) {
      sectionHeading.textContent = isEmploymentCategory
        ? "Employment details"
        : isBusinessCategory
        ? "Business details"
        : isOtherCategory
        ? "Income source details"
        : "Employment / business details";
    }

    if (employmentNameLabel) {
      employmentNameLabel.textContent = isOtherCategory
        ? "Income source / organization"
        : category === "civil_servant"
        ? "Ministry / institution"
        : "Employer / organization";
    }
    if (employmentPositionLabel) {
      employmentPositionLabel.textContent = isOtherCategory
        ? "Role / activity"
        : category === "civil_servant"
        ? "Title / salary scale"
        : "Position / grade";
    }
    if (employmentDurationLabel) {
      employmentDurationLabel.textContent = isOtherCategory
        ? "Time in activity"
        : category === "civil_servant"
        ? "Years in service"
        : "Length of service";
    }
    if (businessNameLabel) {
      businessNameLabel.textContent = category === "service_provider" ? "Service brand / trade name" : "Business or service name";
    }
    if (businessCategoryLabel) {
      businessCategoryLabel.textContent = category === "service_provider" ? "Service category" : "Business / service category";
    }
    if (businessRegistrationLabel) {
      businessRegistrationLabel.textContent = category === "service_provider" ? "License / registration number" : "Registration number";
    }
  }

  function updateLoanApplicationRules() {
    if (!loanForm) {
      return;
    }

    const category = loanForm.elements.applicantCategory?.value || "";
    const amount = Number(loanForm.elements.amount?.value || 0);
    const employmentGroups = Array.from(loanForm.querySelectorAll('[data-category-group="employment"]'));
    const businessGroups = Array.from(loanForm.querySelectorAll('[data-category-group="business"]'));
    const monthlyIncomeLabel = document.getElementById("monthly-income-label");

    const isEmploymentCategory = ["employee", "civil_servant"].includes(category);
    const isBusinessCategory = ["self_employed", "service_provider"].includes(category);
    const isOtherCategory = category === "other";

    setGroupVisibility(employmentGroups, isEmploymentCategory, [
      "employerName",
      "positionGrade",
      "lengthOfService"
    ]);
    setGroupVisibility(businessGroups, isBusinessCategory, [
      "businessName",
      "businessCategory",
      ...(category === "self_employed" ? ["businessRegistrationNumber"] : [])
    ]);
    updateApplicantCategoryCopy(category, isEmploymentCategory, isBusinessCategory, isOtherCategory);

    if (monthlyIncomeLabel) {
      monthlyIncomeLabel.textContent = isEmploymentCategory
        ? "Monthly net salary"
        : isBusinessCategory
        ? "Average monthly business income"
        : "Average monthly income";
    }

    setFieldRequired(loanForm.elements.monthlyIncome, true);

    setDocumentRequirement("income-proof", {
      required: true,
      label: isEmploymentCategory
        ? "Payslip / appointment letter"
        : isBusinessCategory
        ? "Business income proof"
        : "Income proof",
      hint: isOtherCategory ? "supporting evidence accepted" : ""
    });

    setDocumentRequirement("bank-statement", {
      required: isBusinessCategory || isOtherCategory || amount >= 3000000,
      label: "Bank statement",
      hint: amount >= 3000000 ? "required for this amount range" : ""
    });

    updateAddressLabel();
    populateLocalitySuggestions();
  }

  function setGuestMode() {
    document.querySelector(".welcome-text h1 span").textContent = "Guest";
    document.querySelector(".loan-balance-amount").textContent = "UGX 0";
    document.querySelector(".notification-badge").textContent = "0";
    document.querySelector(".snapshot-badge").textContent = "Awaiting sign in";
    renderLoans([]);
    renderNotifications([]);
    renderPaymentState([]);
    updateLoanApplicationAvailability(null, []);
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

  function setNonBorrowerMode(account) {
    setGuestMode();
    if (loanHelpText) {
      loanHelpText.textContent = "Borrower applications can only be submitted from a borrower account.";
    }
    if (feedback) {
      feedback.textContent = `You are signed in as ${String(account?.role || "another account").replace(/_/g, " ")}. Sign out and log in with a borrower account to apply.`;
      feedback.dataset.lockReason = feedback.textContent;
    }
    if (loanSubmitButton) {
      loanSubmitButton.disabled = true;
      loanSubmitButton.textContent = "Borrower login required";
    }
  }

  window.CraneContactActions?.bind?.();

  function isOverdueLoan(_loan) {
    return false;
  }

  function getLoansForFilter(loans, filter = currentLoanFilter) {
    switch (filter) {
      case "active":
        return loans.filter((loan) => liveLoanStatuses.has(loan.status));
      case "overdue":
        return loans.filter((loan) => isOverdueLoan(loan));
      case "completed":
        return loans.filter((loan) => completedLoanStatuses.has(loan.status));
      case "all":
      default:
        return loans;
    }
  }

  function getEmptyLoanFilterMessage(filter) {
    switch (filter) {
      case "active":
        return "No active loan is available right now.";
      case "overdue":
        return "No overdue loan is currently flagged on your account.";
      case "completed":
        return "No completed loan is available in your history yet.";
      case "all":
      default:
        return "Loan history will appear here after your first submission.";
    }
  }

  function setLoanFilter(nextFilter = "all") {
    currentLoanFilter = nextFilter;
    statusPillButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.status === nextFilter);
    });
    renderLoans(dashboardData?.loans || []);
  }

  function renderNotificationFeed(notifications) {
    if (!notificationList) {
      return;
    }

    notificationList.innerHTML = notifications.length
      ? notifications
          .map(
            (item) => `
              <article class="notification-item ${item.read_at ? "" : "is-unread"}" data-notification-id="${item.id}">
                <div class="role-item-head">
                  <div>
                    <strong>${escapeHtml(item.title || "Notification")}</strong>
                    <div class="role-list-note">${escapeHtml(item.message || "")}</div>
                  </div>
                  <span class="role-chip ${item.read_at ? "info" : "warning"}">${item.read_at ? "read" : "new"}</span>
                </div>
              </article>
            `
          )
          .join("")
      : createEmptyState("No notifications yet. New account alerts will appear here.");
  }

  function getRepayableLoans(loans = []) {
    return loans.filter((loan) => repayableLoanStatuses.has(loan.status));
  }

  function getLoanInterestRate(loan) {
    const interestRate = Number(loan?.interest_rate ?? loan?.interestRate ?? defaultLoanInterestRate);
    return Number.isFinite(interestRate) && interestRate > 0 ? interestRate : defaultLoanInterestRate;
  }

  function getLoanTotalBalance(loan) {
    const amount = Number(loan?.amount || 0);
    return amount + (amount * getLoanInterestRate(loan)) / 100;
  }

  function getSelectedRepayableLoan(loans = []) {
    const repayableLoans = getRepayableLoans(loans);
    if (!repayableLoans.length) {
      return null;
    }

    const selectedLoanId = paymentLoanSelect?.value;
    return repayableLoans.find((loan) => loan.id === selectedLoanId) || repayableLoans[0];
  }

  function updatePaymentSummaryValues({ installmentDue = 0, serviceFee = 0, totalToday = 0, outstandingPrincipal = 0, payoffBenefit = 0, totalPayoff = 0 }) {
    if (paymentInstallmentDue) paymentInstallmentDue.textContent = formatCurrency(installmentDue);
    if (paymentServiceFee) paymentServiceFee.textContent = formatCurrency(serviceFee);
    if (paymentTotalToday) paymentTotalToday.textContent = formatCurrency(totalToday);
    if (earlyOutstandingPrincipal) earlyOutstandingPrincipal.textContent = formatCurrency(outstandingPrincipal);
    if (earlyPayoffBenefit) earlyPayoffBenefit.textContent = formatCurrency(payoffBenefit);
    if (earlyTotalPayoff) earlyTotalPayoff.textContent = formatCurrency(totalPayoff);
  }

  function renderPaymentState(loans = []) {
    const repayableLoans = getRepayableLoans(loans);
    const processingLoans = loans.filter((loan) => processingLoanStatuses.has(loan.status));
    const selectedLoan = getSelectedRepayableLoan(loans);
    const paymentType = document.querySelector('input[name="payment-type"]:checked')?.value || "full";

    if (paymentLoanSelect) {
      paymentLoanSelect.innerHTML = repayableLoans.length
        ? repayableLoans.map((loan) => `<option value="${loan.id}">${loan.application_code} - ${formatCurrency(loan.amount)}</option>`).join("")
        : '<option value="">No outstanding loans</option>';

      if (selectedLoan) {
        paymentLoanSelect.value = selectedLoan.id;
      }
    }

    const statusMessage = repayableLoans.length
      ? `Loan ${selectedLoan?.application_code || repayableLoans[0].application_code} is ready for repayment.`
      : processingLoans.length
      ? "Your current loan is still under review. Payment will open after approval or disbursement."
      : loans.some((loan) => completedLoanStatuses.has(loan.status))
      ? "Your recent loans are completed or closed. No payment is due right now."
      : "No approved or disbursed loan is available for payment yet.";

    if (paymentStatusNote) {
      paymentStatusNote.textContent = statusMessage;
    }

    const isPartialPayment = paymentType === "partial";
    if (partialPaymentGroup) {
      partialPaymentGroup.style.display = isPartialPayment && selectedLoan ? "" : "none";
    }
    if (partialPaymentInput) {
      partialPaymentInput.disabled = !isPartialPayment || !selectedLoan;
      if (!selectedLoan) {
        partialPaymentInput.value = "";
      }
    }

    if (!selectedLoan) {
      updatePaymentSummaryValues({});
      if (earlyRepayButton) {
        earlyRepayButton.disabled = true;
      }
      return;
    }

    const totalLoanBalance = getLoanTotalBalance(selectedLoan);
    const installmentDue = totalLoanBalance / Math.max(Number(selectedLoan.term_months || 1), 1);
    const outstandingPrincipal = totalLoanBalance;
    const partialAmount = Number(partialPaymentInput?.value || 0);
    const serviceFee = 0;
    const totalToday = isPartialPayment && partialAmount > 0 ? partialAmount + serviceFee : installmentDue + serviceFee;
    const payoffBenefit = Math.round(Number(selectedLoan.amount || 0) * 0.02);
    const totalPayoff = Math.max(totalLoanBalance - payoffBenefit, 0);

    updatePaymentSummaryValues({
      installmentDue,
      serviceFee,
      totalToday,
      outstandingPrincipal,
      payoffBenefit,
      totalPayoff
    });

    if (earlyRepayButton) {
      earlyRepayButton.disabled = false;
    }
  }

  function renderLoans(loans) {
    const loansList = document.querySelector(".loans-list");
    const loansDetailList = document.querySelector(".loans-detail-list");
    const activeLoans = loans.filter((loan) => liveLoanStatuses.has(loan.status));
    const filteredLoans = getLoansForFilter(loans);

    loansList.innerHTML = activeLoans.length
      ? activeLoans
          .map(
            (loan) => `
              <article class="loan-card">
                <div class="loan-card-header">
                  <strong>${loan.application_code}</strong>
                  <span>${loan.status.replace(/_/g, " ")}</span>
                </div>
                <p>${formatCurrency(loan.amount)} over ${loan.term_months} months at ${getLoanInterestRate(loan)}%</p>
              </article>
            `
          )
          .join("")
      : '<div class="panel-empty-state compact">No active loan request yet. Submit an application to begin.</div>';

    loansDetailList.innerHTML = loans.length
      ? filteredLoans.length
        ? filteredLoans
          .map(
            (loan) => `
              <article class="loan-card detail">
                <div class="loan-card-header">
                  <strong>${loan.application_code}</strong>
                  <span>${loan.status.replace(/_/g, " ")}</span>
                </div>
                <p>${formatCurrency(loan.amount)} | ${loan.purpose.replace(/_/g, " ")} | ${getLoanInterestRate(loan)}%</p>
              </article>
            `
          )
          .join("")
        : createEmptyState(getEmptyLoanFilterMessage(currentLoanFilter))
      : createEmptyState("Loan history will appear here after your first submission.");
  }

  function renderNotifications(notifications) {
    const unread = notifications.filter((item) => !item.read_at).length;
    document.querySelector(".notification-badge").textContent = String(unread);
    renderNotificationFeed(notifications);
  }

  function renderOverview(data) {
    const account = data.profile;
    const loans = data.loans || [];
    const notifications = data.notifications || [];
    const activeLoans = loans.filter((loan) => liveLoanStatuses.has(loan.status));
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
    renderPaymentState(loans);
    updateLoanApplicationAvailability(account, loans);

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
      const activeLoans = loans.filter((loan) => liveLoanStatuses.has(loan.status));
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
      const activeLoans = loans.filter((loan) => liveLoanStatuses.has(loan.status));
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
    if (!account) {
      setGuestMode();
      return;
    }
    if (account.role !== "user") {
      setNonBorrowerMode(account);
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
    const offerState = getPromoOfferState();
    if (loanForm?.elements?.amount) {
      loanForm.elements.amount.value = String(Math.round(offerState.amount));
    }
    if (loanForm?.elements?.termMonths) {
      loanForm.elements.termMonths.value = String(offerState.termMonths);
    }
    updateLoanApplicationRules();
    persistLoanDraft();
    setActiveView("get-loan");
  });
  offerSlider?.addEventListener("input", renderPromoOffer);
  document.querySelector(".refresh-btn")?.addEventListener("click", () => loadDashboard(true));
  document.querySelectorAll('[data-loans-action="view-all"]').forEach((button) => button.addEventListener("click", () => {
    if (!isAuthenticated()) {
      openModal(false);
      return;
    }
    setActiveView("loans");
    setLoanFilter("all");
  }));
  document.querySelectorAll('[data-loans-action="review-loans"]').forEach((button) => button.addEventListener("click", () => {
    if (!isAuthenticated()) {
      openModal(false);
      return;
    }
    setActiveView("loans");
    setLoanFilter("active");
  }));
  document.querySelectorAll('[data-quick-box="active"]').forEach((button) => button.addEventListener("click", () => {
    if (!isAuthenticated()) {
      openModal(false);
      return;
    }
    setActiveView("loans");
    setLoanFilter("active");
  }));
  document.querySelectorAll('[data-quick-box="overdue"]').forEach((button) => button.addEventListener("click", () => {
    if (!isAuthenticated()) {
      openModal(false);
      return;
    }
    setActiveView("loans");
    setLoanFilter("overdue");
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

  initializeDocumentUploadState();

  documentUploadFields.forEach((field) => {
    const input = getDocumentInput(field);
    const openFileButton = field.querySelector("[data-open-file]");
    const openCameraButton = field.querySelector("[data-open-camera]");

    openFileButton?.addEventListener("click", () => input?.click());
    openCameraButton?.addEventListener("click", async () => {
      await openCameraModalForField(field);
    });

    input?.addEventListener("change", () => {
      setStoredDocumentFiles(field, Array.from(input.files || []));
    });
  });

  cameraModal?.addEventListener("click", (event) => {
    if (event.target === cameraModal) {
      closeCameraModal();
    }
  });

  document.querySelectorAll("[data-camera-close]").forEach((button) => {
    button.addEventListener("click", closeCameraModal);
  });
  cameraCaptureButton?.addEventListener("click", capturePhotoFromCamera);
  cameraUseButton?.addEventListener("click", confirmCapturedPhoto);
  cameraRetakeButton?.addEventListener("click", async () => {
    if (activeCameraField) {
      await startCameraStreamForField(activeCameraField);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && cameraModal?.classList.contains("active")) {
      closeCameraModal();
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
  document.querySelector(".header-actions .icon-btn")?.addEventListener("click", () => {
    if (!isAuthenticated()) {
      openModal(false);
      return;
    }
    notificationPanel?.classList.toggle("active");
  });

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

  statusPillButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!isAuthenticated()) {
        openModal(false);
        return;
      }
      setLoanFilter(button.dataset.status || "all");
    });
  });

  paymentLoanSelect?.addEventListener("change", () => {
    renderPaymentState(dashboardData?.loans || []);
  });

  partialPaymentInput?.addEventListener("input", () => {
    renderPaymentState(dashboardData?.loans || []);
  });

  document.querySelectorAll('input[name="payment-type"]').forEach((input) => {
    input.addEventListener("change", () => {
      renderPaymentState(dashboardData?.loans || []);
    });
  });

  notificationList?.addEventListener("click", async (event) => {
    const item = event.target.closest("[data-notification-id]");
    if (!item) {
      return;
    }

    const notificationId = item.dataset.notificationId;
    const notification = dashboardData?.notifications?.find((entry) => entry.id === notificationId);
    if (!notification || notification.read_at) {
      return;
    }

    try {
      const response = await window.CraneApi.markNotificationRead(notificationId);
      const updatedNotification = response.notification;
      dashboardData = dashboardData
        ? {
            ...dashboardData,
            notifications: (dashboardData.notifications || []).map((entry) => (entry.id === notificationId ? updatedNotification : entry)),
            summary: {
              ...(dashboardData.summary || {}),
              unreadNotifications: Math.max(0, (dashboardData.summary?.unreadNotifications || 0) - 1)
            }
          }
        : dashboardData;

      renderNotifications(dashboardData?.notifications || []);
      if (dashboardData) {
        renderOverview(dashboardData);
        renderProfile(window.CraneAuth.getAccount() || dashboardData.profile, dashboardData);
      }
    } catch (error) {
      window.CraneNotify.error(error.message || "Unable to update notification.");
    }
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
    const account = window.CraneAuth.getAccount();
    if (!account) {
      window.CraneNotify.warning("Please sign in before submitting a loan request.");
      openModal(false);
      return;
    }
    if (account.role !== "user") {
      const roleMessage = "This loan form is only available to borrower accounts. Sign out of the admin session and log in as a borrower.";
      if (feedback) {
        feedback.textContent = roleMessage;
        feedback.dataset.lockReason = roleMessage;
      }
      window.CraneNotify.warning(roleMessage);
      return;
    }

    const accessState = getLoanApplicationAccessState(account, dashboardData?.loans || []);
    if (!accessState.canApply) {
      feedback.textContent = accessState.message;
      feedback.dataset.lockReason = accessState.message;
      window.CraneNotify.warning(accessState.message);
      return;
    }
    if (!validateDocumentUploads()) {
      return;
    }

    feedback.textContent = "Submitting application...";
    delete feedback.dataset.lockReason;
    const formData = new FormData(loanForm);
    const payload = {};
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        continue;
      }
      payload[key] = value;
    }
    payload.phone = window.CraneForms.normalizePhone(payload.phone, "+256");

    let createdLoan = null;
    try {
      const { loan } = await window.CraneApi.applyLoan(payload);
      createdLoan = loan;
      clearLoanDraft();
      for (const field of documentUploadFields) {
        const input = getDocumentInput(field);
        const files = getStoredDocumentFiles(field);
        if (!files.length) {
          continue;
        }
        for (const file of files) {
          feedback.textContent = `Uploading ${getDocumentFieldLabel(field).toLowerCase()}...`;
          try {
            const documentType = input.name === "additional_document" ? "additional_document" : input.name;
            await window.CraneApi.uploadLoanDocument(loan.id, documentType, file);
          } catch (uploadError) {
            throw new Error(`${getDocumentFieldLabel(field)}: ${uploadError.message || "Upload failed."}`);
          }
        }
      }

      loanForm.reset();
      resetDocumentUploadState();
      updateLoanApplicationRules();
      feedback.textContent = `Application ${loan.application_code} submitted successfully.`;
      window.CraneNotify.success("Loan request submitted.");
      setActiveView("loans");
      await loadDashboard();
    } catch (error) {
      if (error.status === 401) {
        feedback.textContent = "Your borrower session expired. Please sign in again to continue.";
        window.CraneNotify.warning("Please sign in again to continue your loan application.");
        openModal(false);
        return;
      }
      if (createdLoan) {
        clearLoanDraft();
        feedback.textContent = `Application ${createdLoan.application_code} was submitted, but ${error.message || "one or more document uploads failed"}.`;
        window.CraneNotify.warning(error.message || "The loan request was created, but some documents still need attention.");
        setActiveView("loans");
        await loadDashboard();
        return;
      }
      feedback.textContent = error.message || "Unable to submit loan request.";
      window.CraneNotify.error(error.message || "Submission failed.");
    }
  });

  window.addEventListener("crane:notification:new", () => scheduleDashboardRefresh());
  window.addEventListener("crane:loan:created", () => scheduleDashboardRefresh());
  window.addEventListener("crane:loan:updated", () => scheduleDashboardRefresh());
  window.addEventListener("crane:document:updated", () => scheduleDashboardRefresh());
  window.addEventListener("crane:user:updated", () => scheduleDashboardRefresh());
  window.addEventListener("crane:account:status", (event) => {
    const status = event.detail?.status;
    if (status && status !== "active") {
      window.CraneNotify.warning(`Your account is now ${status}.`);
      window.CraneAuth.logout("index.html");
      return;
    }
    scheduleDashboardRefresh();
  });

  loanForm?.elements?.applicantCategory?.addEventListener("change", updateLoanApplicationRules);
  loanForm?.elements?.amount?.addEventListener("input", updateLoanApplicationRules);
  loanForm?.addEventListener("input", persistLoanDraft);
  loanForm?.addEventListener("change", persistLoanDraft);
  const handleDistrictSelection = () => {
    populateLocalitySuggestions({ resetChildren: true });
    updateLoanApplicationRules();
    persistLoanDraft();
  };
  loanForm?.elements?.district?.addEventListener("change", handleDistrictSelection);
  loanForm?.elements?.district?.addEventListener("input", handleDistrictSelection);
  loanForm?.elements?.subcounty?.addEventListener("change", () => {
    if (loanForm?.elements?.parish) {
      loanForm.elements.parish.value = "";
    }
    if (loanForm?.elements?.village) {
      loanForm.elements.village.value = "";
    }
    populateLocalitySuggestions();
    persistLoanDraft();
  });
  loanForm?.elements?.parish?.addEventListener("change", () => {
    if (loanForm?.elements?.village) {
      loanForm.elements.village.value = "";
    }
    populateLocalitySuggestions();
    persistLoanDraft();
  });
  prioritizeDistrictOptions();
  renderPromoOffer();
  restoreLoanDraft();
  updateLoanApplicationRules();

  // Play intro animation first, then load dashboard
  await playIntroAnimation();
  await window.CraneAuth.bootstrap();
  await loadDashboard();
  window.CraneRealtime.connect();
  setActiveView(getInitialView());
});
