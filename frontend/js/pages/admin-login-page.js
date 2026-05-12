document.addEventListener("DOMContentLoaded", async () => {
  await window.CraneAuth.bootstrap();
  const form = document.getElementById("admin-login-form");
  const button = form?.querySelector(".btn-login");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      const username = document.getElementById("admin-username").value.trim();
      const pin = document.getElementById("admin-pin").value.trim();
      const response = await window.CraneApi.loginAdmin({ username, pin });
      window.CraneAuth.setSession(response);
      window.location.href = "/admin";
    } catch (error) {
      window.CraneNotify.error(error.message || "Admin sign-in failed.");
    } finally {
      button.disabled = false;
    }
  });
});
