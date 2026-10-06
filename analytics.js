/* Proactive Digital GA4. Only consented production visits are measured. */
(() => {
  'use strict';
  if (window.pdAnalytics) return;
  const id = 'G-9CCVCZ1VN4';
  const key = 'pd-analytics-consent-v1';
  const production = ['getproactivedigital.com', 'www.getproactivedigital.com'].includes(location.hostname);
  if (/^\/lab(?:[./-]|$)/i.test(location.pathname)) return;
  let consent = null;
  try { consent = localStorage.getItem(key); } catch (_) { /* Storage is optional. */ }
  let started = false;
  let banner;
  let settings;
  const disabled = 'ga-disable-' + id;
  window[disabled] = true;
  function cleanUrl(value) {
    try { const url = new URL(value); return url.origin + url.pathname; } catch (_) { return ''; }
  }
  function start() {
    if (!production || consent !== 'granted' || started) return;
    started = true;
    window[disabled] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', id, {
      send_page_view: true,
      page_location: cleanUrl(location.href),
      page_referrer: cleanUrl(document.referrer),
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.append(script);
  }
  function event(name, params = {}) {
    if (!production || !started || consent !== 'granted') return;
    // Only fixed event names and fixed, non-personal parameters are accepted.
    const allowed = {
      generate_lead: { method: 'contact_form' },
      contact_click: { contact_method: params.contact_method === 'phone' ? 'phone' : 'email' },
      booking_click: { provider: 'calendly' }
    };
    if (!allowed[name]) return;
    window.gtag('event', name, { ...allowed[name], send_to: id });
  }
  function clearCookies() {
    const names = document.cookie.split(';').map(item => item.trim().split('=')[0]).filter(name => /^_ga(?:_|$)/.test(name));
    for (const name of names) {
      for (const domain of ['', location.hostname, '.getproactivedigital.com']) {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax' + (domain ? '; domain=' + domain : '');
      }
    }
  }
  function choose(value) {
    consent = value;
    try { localStorage.setItem(key, value); } catch (_) { /* Respect choice for this page. */ }
    if (value === 'granted') {
      if (started) {
        window[disabled] = false;
        window.gtag('consent', 'update', { analytics_storage: 'granted' });
      } else start();
    } else {
      window[disabled] = true;
      if (started) window.gtag('consent', 'update', { analytics_storage: 'denied' });
      clearCookies();
    }
    banner.hidden = true;
    settings.focus();
  }
  window.pdAnalytics = { event };
  function init() {
    banner = document.createElement('section');
    banner.className = 'pd-analytics-banner';
    banner.setAttribute('aria-label', 'Analytics choices');
    banner.innerHTML = '<div><strong>Help us improve your experience</strong><p>May we use Google Analytics to understand visits and inquiries? Your choice won’t affect how the site works. <a href="/privacy.html">Privacy details</a></p></div><div class="pd-analytics-actions"><button type="button" data-choice="denied">No thanks</button><button type="button" data-choice="granted">Allow analytics</button></div>';
    banner.hidden = consent === 'granted' || consent === 'denied';
    banner.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => choose(button.dataset.choice)));
    settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'pd-analytics-settings';
    settings.textContent = 'Analytics choices';
    settings.addEventListener('click', () => { banner.hidden = false; banner.querySelector('button').focus(); });
    document.body.append(banner);
    (document.querySelector('footer') || document.body).append(settings);
    document.addEventListener('click', e => {
      const link = e.target.closest?.('a[href]');
      if (!link) return;
      if (link.protocol === 'tel:') event('contact_click', { contact_method: 'phone' });
      else if (link.protocol === 'mailto:') event('contact_click', { contact_method: 'email' });
      else if (link.hostname === 'calendly.com') event('booking_click');
    });
    start();
  }
  window.addEventListener('storage', e => {
    if (e.key !== key && e.key !== null) return;
    consent = e.newValue;
    if (consent !== 'granted') {
      window[disabled] = true;
      if (started) window.gtag('consent', 'update', { analytics_storage: 'denied' });
      clearCookies();
    } else if (!started) start();
    else { window[disabled] = false; window.gtag('consent', 'update', { analytics_storage: 'granted' }); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
