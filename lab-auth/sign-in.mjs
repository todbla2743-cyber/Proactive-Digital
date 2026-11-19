import { getSettings, handleAuthCallback, logout, oauthLogin } from '@netlify/identity';
import GoTrue from 'gotrue-js';

const button = document.getElementById('google');
const status = document.getElementById('status');
const sessionUrl = '/.netlify/functions/lab-session';
const startedKey = 'pd-lab-google-start';
let invitation;

async function initialize() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has('error') || fragment.has('error_description')) {
    history.replaceState(null, '', location.pathname);
    sessionStorage.removeItem(startedKey);
    status.textContent = 'Sign-in was interrupted. Try again with your invited Google account.';
  } else if (fragment.has('invite_token')) {
    const result = await handleAuthCallback();
    if (result?.type === 'invite') invitation = result.token;
    status.textContent = 'Choose the Google account where you received this invitation.';
  } else if (fragment.has('access_token')) {
    const started = Number(sessionStorage.getItem(startedKey));
    sessionStorage.removeItem(startedKey);
    if (started > 0 && started <= Date.now() && Date.now() - started < 15 * 60 * 1000) {
      let established = false;
      try {
        const result = await handleAuthCallback();
        if (result?.type === 'oauth') {
          const response = await fetch(sessionUrl, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'X-Lab-Session': 'google' } });
          established = response.ok && (await response.json()).active === true;
        }
      } finally {
        history.replaceState(null, '', location.pathname);
        // Only the short-lived HttpOnly Lab session is needed after this exchange.
        try { await logout(); } catch { /* Clear local provider credentials even if the provider is offline. */ }
        localStorage.removeItem('gotrue.user');
        for (const key of ['nf_jwt', 'nf_refresh']) document.cookie = `${key}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
      }
      if (established) { location.replace('/lab.html'); return; }
      status.textContent = 'This account could not open the Lab. Choose the account that received the invitation.';
    } else {
      history.replaceState(null, '', location.pathname);
      status.textContent = 'Start a fresh Google sign-in in this tab.';
    }
  } else {
    const current = await fetch(sessionUrl, { credentials: 'same-origin', cache: 'no-store' });
    if (current.ok && (await current.json()).active === true) { location.replace('/lab.html'); return; }
    status.textContent = '';
  }
  const settings = await getSettings();
  if (!settings.providers.google) { status.textContent = 'Google sign-in is temporarily unavailable.'; return; }
  button.hidden = false;
}

button.addEventListener('click', () => {
  button.disabled = true;
  sessionStorage.setItem(startedKey, String(Date.now()));
  try {
    if (invitation) {
      const identity = new GoTrue({ APIUrl: `${location.origin}/.netlify/identity` });
      location.assign(identity.acceptInviteExternalUrl('google', encodeURIComponent(invitation)));
    } else {
      oauthLogin('google');
    }
  } catch (error) {
    if (error.message !== 'Redirecting to OAuth provider') {
      status.textContent = 'Google sign-in is temporarily unavailable. Please try again.';
      button.disabled = false;
      sessionStorage.removeItem(startedKey);
    }
  }
});

initialize().catch(() => {
  history.replaceState(null, '', location.pathname);
  status.textContent = 'Google sign-in could not finish. Reload this page to try again.';
});
