(function bootstrapFormValidator(global) {
  function normalizePhone(input, countryCode) {
    const digits = String(input || "").replace(/\D/g, "");
    if (!digits) {
      return "";
    }
    if (String(countryCode || "").startsWith("+")) {
      return `${countryCode}${digits.replace(/^0+/, "")}`;
    }
    return digits.startsWith("0") ? `+256${digits.slice(1)}` : `+${digits}`;
  }

  function isPin(value) {
    return /^\d{6}$/.test(String(value || "").trim());
  }

  function required(value) {
    return String(value || "").trim().length > 0;
  }

  function serializeForm(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  global.CraneForms = {
    isPin,
    normalizePhone,
    required,
    serializeForm
  };
})(window);
