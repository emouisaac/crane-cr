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

const ADMIN_ROLE_VALUES = new Set(ADMIN_ROLE_OPTIONS.map((option) => option.value));

const CAPABILITIES = {
  DASHBOARD_VIEW: "dashboard:view",
  APPLICATIONS_VIEW: "applications:view",
  APPLICATIONS_UPDATE: "applications:status:update",
  BORROWERS_VIEW: "borrowers:view",
  ACCOUNTS_PIN_RESET: "accounts:pin:reset",
  DOCUMENTS_VIEW: "documents:view",
  DOCUMENTS_REVIEW: "documents:review",
  DOCUMENTS_REQUEST: "documents:request",
  COMMENTS_ADD: "comments:add",
  NOTIFICATIONS_VIEW: "notifications:view",
  LOANS_APPROVE: "loans:approve"
};

const STANDARD_ADMIN_CAPABILITIES = [
  CAPABILITIES.DASHBOARD_VIEW,
  CAPABILITIES.APPLICATIONS_VIEW,
  CAPABILITIES.APPLICATIONS_UPDATE,
  CAPABILITIES.BORROWERS_VIEW,
  CAPABILITIES.DOCUMENTS_VIEW,
  CAPABILITIES.DOCUMENTS_REVIEW,
  CAPABILITIES.DOCUMENTS_REQUEST,
  CAPABILITIES.COMMENTS_ADD,
  CAPABILITIES.NOTIFICATIONS_VIEW
];

const ROLE_CAPABILITIES = {
  manager: [...STANDARD_ADMIN_CAPABILITIES, CAPABILITIES.ACCOUNTS_PIN_RESET],
  secretary: [
    CAPABILITIES.DASHBOARD_VIEW,
    CAPABILITIES.APPLICATIONS_VIEW,
    CAPABILITIES.BORROWERS_VIEW,
    CAPABILITIES.ACCOUNTS_PIN_RESET,
    CAPABILITIES.DOCUMENTS_REQUEST,
    CAPABILITIES.COMMENTS_ADD,
    CAPABILITIES.NOTIFICATIONS_VIEW
  ],
  loan_officer: [...STANDARD_ADMIN_CAPABILITIES, CAPABILITIES.ACCOUNTS_PIN_RESET],
  contact_support: [
    CAPABILITIES.DASHBOARD_VIEW,
    CAPABILITIES.BORROWERS_VIEW,
    CAPABILITIES.ACCOUNTS_PIN_RESET,
    CAPABILITIES.DOCUMENTS_REQUEST,
    CAPABILITIES.COMMENTS_ADD,
    CAPABILITIES.NOTIFICATIONS_VIEW
  ],
  analyst: [
    CAPABILITIES.DASHBOARD_VIEW,
    CAPABILITIES.APPLICATIONS_VIEW,
    CAPABILITIES.BORROWERS_VIEW,
    CAPABILITIES.ACCOUNTS_PIN_RESET,
    CAPABILITIES.DOCUMENTS_VIEW,
    CAPABILITIES.DOCUMENTS_REVIEW,
    CAPABILITIES.COMMENTS_ADD,
    CAPABILITIES.NOTIFICATIONS_VIEW
  ],
  compliance_officer: [
    CAPABILITIES.DASHBOARD_VIEW,
    CAPABILITIES.APPLICATIONS_VIEW,
    CAPABILITIES.DOCUMENTS_VIEW,
    CAPABILITIES.DOCUMENTS_REVIEW,
    CAPABILITIES.COMMENTS_ADD,
    CAPABILITIES.NOTIFICATIONS_VIEW
  ],
  recovery_officer: [
    CAPABILITIES.DASHBOARD_VIEW,
    CAPABILITIES.BORROWERS_VIEW,
    CAPABILITIES.ACCOUNTS_PIN_RESET,
    CAPABILITIES.COMMENTS_ADD,
    CAPABILITIES.NOTIFICATIONS_VIEW
  ],
  cashier: [
    CAPABILITIES.DASHBOARD_VIEW,
    CAPABILITIES.APPLICATIONS_VIEW,
    CAPABILITIES.BORROWERS_VIEW,
    CAPABILITIES.ACCOUNTS_PIN_RESET,
    CAPABILITIES.COMMENTS_ADD,
    CAPABILITIES.NOTIFICATIONS_VIEW
  ]
};

const SUPER_ADMIN_CAPABILITIES = [...STANDARD_ADMIN_CAPABILITIES, CAPABILITIES.ACCOUNTS_PIN_RESET, CAPABILITIES.LOANS_APPROVE];

function normalizeAdminRole(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return ADMIN_ROLE_VALUES.has(normalized) ? normalized : "manager";
}

function getAdminRoleLabel(value) {
  const normalized = normalizeAdminRole(value);
  return ADMIN_ROLE_OPTIONS.find((option) => option.value === normalized)?.label || "Manager";
}

function getAdminRoleCapabilities(value) {
  const normalized = normalizeAdminRole(value);
  return ROLE_CAPABILITIES[normalized] || ROLE_CAPABILITIES.manager;
}

function getDefaultPermissionsForAdminRole(value) {
  return [...getAdminRoleCapabilities(value)];
}

function hasAdminCapability(account, capability) {
  if (!account) {
    return false;
  }
  if (account.role === "super_admin") {
    return SUPER_ADMIN_CAPABILITIES.includes(capability);
  }
  if (account.role !== "admin") {
    return false;
  }
  return getAdminRoleCapabilities(account.admin_role || account.adminRole).includes(capability);
}

function getAudienceRolesForAccount(account) {
  if (!account?.role) {
    return [];
  }

  if (account.role === "admin") {
    const adminRole = normalizeAdminRole(account.admin_role || account.adminRole);
    const audiences = new Set(["admin", `admin:${adminRole}`]);

    if (adminRole === "manager" || adminRole === "loan_officer") {
      ADMIN_ROLE_OPTIONS.forEach((option) => audiences.add(`admin:${option.value}`));
    }

    return Array.from(audiences);
  }

  return [account.role];
}

module.exports = {
  ADMIN_ROLE_OPTIONS,
  CAPABILITIES,
  STANDARD_ADMIN_CAPABILITIES,
  SUPER_ADMIN_CAPABILITIES,
  getAdminRoleCapabilities,
  getAdminRoleLabel,
  getAudienceRolesForAccount,
  getDefaultPermissionsForAdminRole,
  hasAdminCapability,
  normalizeAdminRole
};
