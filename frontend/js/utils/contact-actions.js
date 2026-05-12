(function bootstrapContactActions(global) {
  const SUPPORT_PHONE = "+256788408032";
  const SUPPORT_EMAIL = "support@craneloans.com";
  const WHATSAPP_MESSAGE = "Hello Crane Credit, I need support.";

  function closeActiveContactModal() {
    document.querySelectorAll(".contact-modal-overlay.active").forEach((overlay) => {
      overlay.classList.remove("active");
    });
  }

  function bindContactActions() {
    document.querySelectorAll(".call-option").forEach((button) => {
      button.addEventListener("click", () => {
        closeActiveContactModal();
        global.location.href = `tel:${SUPPORT_PHONE}`;
      });
    });

    document.querySelectorAll(".whatsapp-option").forEach((button) => {
      button.addEventListener("click", () => {
        closeActiveContactModal();
        global.open(`https://wa.me/${SUPPORT_PHONE.replace(/\D/g, "")}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`, "_blank", "noopener");
      });
    });

    document.querySelectorAll(".email-option").forEach((button) => {
      button.addEventListener("click", () => {
        closeActiveContactModal();
        global.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Crane Credit Support")}`;
      });
    });
  }

  global.CraneContactActions = {
    bind: bindContactActions
  };
})(window);
