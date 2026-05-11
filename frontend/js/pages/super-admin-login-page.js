document.addEventListener("DOMContentLoaded", async () => {
  await window.CraneAuth.bootstrap();
  const form = document.getElementById("super-admin-login-form");
  const button = form?.querySelector(".btn-login");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      const username = document.getElementById("super-admin-username").value.trim();
      const password = document.getElementById("super-admin-password").value.trim();
      const response = await window.CraneApi.loginSuperAdmin({ username, password });
      window.CraneAuth.setSession(response);
      window.location.href = "super-admin.html";
    } catch (error) {
      window.CraneNotify.error(error.message || "Super admin sign-in failed.");
    } finally {
      button.disabled = false;
    }
  });
});
