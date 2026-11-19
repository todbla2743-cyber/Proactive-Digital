(() => {
  const endpoint = '/.netlify/functions/lab-session';
  let googleSession = false;
  const existingLogout = window.doLogout;
  window.doLogout = async function () {
    if (!googleSession) return existingLogout();
    try { await existingLogout(); } finally {
      try {
        const result = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'X-Lab-Session': 'logout' } });
        if (!result.ok) throw new Error();
        location.replace('/lab-sign-in.html');
      } catch { alert('Sign-out could not finish. Reconnect and sign out before leaving this device.'); location.reload(); }
    }
  };
  async function checkSession() {
    const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return;
    const result = await response.json();
    if (googleSession && !result.active) { location.replace('/lab-sign-in.html'); return; }
    if (!googleSession && result.active) { googleSession = true; await window.doLogin(); }
  }
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  document.addEventListener('visibilitychange', () => { if (googleSession && !document.hidden) checkSession().catch(() => {}); });
  checkSession().catch(() => {});
})();
