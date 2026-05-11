(function bootstrapAuthManager(global) {
  const state = {
    bootstrap: null,
    session: null
  };

  function setSession(sessionPayload) {
    state.session = sessionPayload;
    global.dispatchEvent(new CustomEvent("crane:session", { detail: sessionPayload }));
    return sessionPayload;
  }

  function clearSession() {
    state.session = null;
    global.dispatchEvent(new CustomEvent("crane:logout"));
  }

  async function bootstrap() {
    if (!state.bootstrap) {
      state.bootstrap = (async () => {
        await global.CraneApi.bootstrap();
        try {
          const session = await global.CraneApi.session();
          return setSession(session);
        } catch (error) {
          if (error.status === 401) {
            clearSession();
            return null;
          }
          throw error;
        }
      })();
    }
    return state.bootstrap;
  }

  async function refreshSession() {
    const session = await global.CraneApi.session();
    return setSession(session);
  }

  function getAccount() {
    return state.session?.account || null;
  }

  function getNotifications() {
    return state.session?.notifications || [];
  }

  async function logout(redirectTo) {
    try {
      await global.CraneApi.logout();
    } finally {
      clearSession();
      if (redirectTo) {
        global.location.href = redirectTo;
      }
    }
  }

  async function requireRole(roles, redirectTo) {
    const session = state.session || (await bootstrap());
    const account = session?.account;
    if (!account || (roles.length && !roles.includes(account.role))) {
      if (redirectTo) {
        global.location.href = redirectTo;
      }
      return null;
    }
    return account;
  }

  global.CraneAuth = {
    bootstrap,
    refreshSession,
    setSession,
    clearSession,
    getAccount,
    getNotifications,
    logout,
    requireRole
  };
})(window);
