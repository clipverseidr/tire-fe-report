/**
 * auth.js
 * Autentikasi Google Identity Services (GIS), Sesi Offline, & RBAC UI Guard.
 */

const AuthManager = (function() {
  const SESSION_STORAGE_KEY = 'TIRE_FE_AUTH_SESSION_V1';
  let currentSession = null;

  function loadStoredSession() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveStoredSession(sessionObj) {
    currentSession = sessionObj;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionObj));
    } catch (e) {
      console.warn('Gagal menyimpan sesi ke localStorage:', e);
    }
  }

  function clearSession() {
    currentSession = null;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {}
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
  }

  function getSession() {
    if (!currentSession) {
      currentSession = loadStoredSession();
    }
    return currentSession;
  }

  function getIdToken() {
    const s = getSession();
    return s && s.idToken ? s.idToken : '';
  }

  function getUser() {
    const s = getSession();
    return s && s.user ? s.user : null;
  }

  function getPermissions() {
    const s = getSession();
    return s && s.permissions ? s.permissions : {};
  }

  function hasPermission(permKey) {
    const perms = getPermissions();
    return Boolean(perms && perms[permKey]);
  }

  function getAllowedSites() {
    const user = getUser();
    return user && Array.isArray(user.assignedSites) ? user.assignedSites : [];
  }

  /**
   * Memproses credential JWT yang dikembalikan Google Identity Services.
   */
  async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
      throw new Error('Credential Google tidak diterima.');
    }

    const idToken = response.credential;
    const apiUrl = window.APP_CONFIG && window.APP_CONFIG.API_URL;
    if (!apiUrl) {
      throw new Error('API_URL belum dikonfigurasi pada APP_CONFIG.');
    }

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'loginVerify',
        idToken: idToken
      }),
      redirect: 'follow'
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Verifikasi login gagal.');
    }

    const sessionPayload = {
      idToken: idToken,
      user: data.user,
      permissions: data.permissions,
      verifiedAt: new Date().toISOString()
    };

    saveStoredSession(sessionPayload);

    // Cache Master Data jika diterima saat login
    if (data.masterData && window.DBManager && typeof window.DBManager.saveMasterData === 'function') {
      await window.DBManager.saveMasterData(data.masterData);
    }

    applyRolePermissionsToUI();
    return sessionPayload;
  }

  /**
   * Menginisialisasi tombol Sign In Google Identity Services.
   */
  function initGoogleSignInButton(buttonContainerId, clientId, onSuccess, onError) {
    const container = document.getElementById(buttonContainerId);
    if (!container) return;

    if (!window.google || !google.accounts || !google.accounts.id) {
      if (typeof onError === 'function') {
        onError(new Error('Library Google Identity Services belum termuat.'));
      }
      return;
    }

    google.accounts.id.initialize({
      client_id: clientId,
      callback: async function(resp) {
        try {
          const session = await handleGoogleCredentialResponse(resp);
          if (typeof onSuccess === 'function') onSuccess(session);
        } catch (err) {
          if (typeof onError === 'function') onError(err);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true
    });

    container.innerHTML = '';
    google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      width: 280
    });
  }

  /**
   * Menyesuaikan tampilan menu & tombol berdasarkan Role dan Permissions dari server.
   */
  function applyRolePermissionsToUI() {
    const user = getUser();
    const perms = getPermissions();

    const userBadgeEl = document.getElementById('authUserInfo');
    if (userBadgeEl && user) {
      userBadgeEl.textContent = `${user.fullName} (${user.role}) • Sites: ${user.assignedSitesRaw}`;
    }

    document.querySelectorAll('[data-requires-perm]').forEach(function(el) {
      const reqPerm = el.getAttribute('data-requires-perm');
      const allowed = Boolean(perms && perms[reqPerm]);
      el.classList.toggle('d-none', !allowed);
    });

    document.querySelectorAll('[data-requires-role]').forEach(function(el) {
      const allowedRoles = el.getAttribute('data-requires-role').split(',').map(function(r) {
        return r.trim().toUpperCase();
      });
      const userRole = user ? String(user.role).toUpperCase() : '';
      el.classList.toggle('d-none', allowedRoles.indexOf(userRole) === -1);
    });
  }

  return {
    getSession: getSession,
    getIdToken: getIdToken,
    getUser: getUser,
    getPermissions: getPermissions,
    hasPermission: hasPermission,
    getAllowedSites: getAllowedSites,
    clearSession: clearSession,
    handleGoogleCredentialResponse: handleGoogleCredentialResponse,
    initGoogleSignInButton: initGoogleSignInButton,
    applyRolePermissionsToUI: applyRolePermissionsToUI
  };
})();