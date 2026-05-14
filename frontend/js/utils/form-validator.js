(function bootstrapFormValidator(global) {
  function extractUgandaSubscriberDigits(input) {
    const digits = String(input || "").replace(/\D/g, "");
    if (!digits) {
      return "";
    }

    if (digits.length === 9) {
      return digits;
    }
    if (digits.length === 10 && digits.startsWith("0")) {
      return digits.slice(1);
    }
    if (digits.length === 12 && digits.startsWith("256")) {
      return digits.slice(3);
    }
    if (digits.length > 12 && (digits.startsWith("256") || digits.startsWith("0"))) {
      return digits.slice(-9);
    }

    return "";
  }

  function normalizePhone(input, countryCode) {
    const ugandaSubscriberDigits = extractUgandaSubscriberDigits(input);
    if (ugandaSubscriberDigits) {
      return `+256${ugandaSubscriberDigits}`;
    }

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
