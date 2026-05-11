document.addEventListener("DOMContentLoaded", async () => {
  await window.CraneAuth.bootstrap();

  const form = document.getElementById("login-form");
  const errorBox = document.getElementById("error-message");
  const button = document.getElementById("login-btn");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.classList.remove("show");
    form.classList.add("loading");
    button.disabled = true;

    try {
      const identifier = document.getElementById("email").value.trim();
      const secret = document.getElementById("password").value.trim();
      const response = await window.CraneApi.loginUser({ identifier, secret });
      window.CraneAuth.setSession(response);
      window.location.href = "index.html";
    } catch (error) {
      errorBox.textContent = error.message || "Unable to sign in.";
      errorBox.classList.add("show");
    } finally {
      form.classList.remove("loading");
      button.disabled = false;
    }
  });
});
