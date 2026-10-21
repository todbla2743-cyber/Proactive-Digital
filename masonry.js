const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const stages = {
  found: {
    title: 'Show up with a clear story.',
    description: 'Service pages, accurate business details, and practical Google Business Profile support help people understand what you do and where you work.',
    example: '<div class="mock-search"><div class="mock-search-top"><span aria-hidden="true">⌕</span> What a potential customer needs to know</div><span class="overline">SAMPLE MASONRY CO. · CONCEPT BUSINESS</span><h4>Brick, stone, and repairs. Clearly explained.</h4><p class="mini-text">Your services. Your real project photos. Your coverage area. One clear way to get in touch.</p><div class="search-chips"><span>Brick repair</span><span>Stonework</span><span>Service areas</span><span>Request an estimate ↗</span></div></div>',
    note: 'We start by reviewing your existing presence and prioritizing the gaps that matter.'
  },
  trust: {
    title: 'Put the proof where customers can see it.',
    description: 'Give each project context: what the customer needed, what your crew did, and the finished result. Add verified reviews and accurate business credentials.',
    example: '<div class="mock-portfolio"><img src="/masonry-assets/todd-masonry-detail-768.webp" alt="Concept image of Todd inspecting a masonry wall"><div><span class="overline">ILLUSTRATIVE PROJECT PRESENTATION</span><h4>More than a photo.</h4><p>A useful project story connects the scope, craftsmanship, materials, and result.</p><p><strong>Built from your actual completed work.</strong></p></div></div>',
    note: 'These scenes illustrate the concept. Your completed page would use your own projects and verified information.'
  },
  capture: {
    title: 'Collect the details that change the callback.',
    description: 'A thoughtful estimate request can collect project type, location, timing, and useful photos. Send those details to the agreed place so your team can act.',
    example: '<div class="mock-intake"><div><span>Type of work</span><strong>Brick repair</strong></div><div><span>Project location</span><strong>Richmond, Virginia</strong></div><div><span>Ideal timing</span><strong>Within a month</strong></div><div><span>Useful photo prompts</span><strong>Close-up + full wall</strong></div><div><span>Next action</span><strong>Review and call back ↗</strong></div></div>',
    note: 'Intake questions and notifications are scoped around your services and the tools you already use.'
  },
  follow: {
    title: 'A next step for every conversation.',
    description: 'Choose a simple way to track inquiries, schedule callbacks, and organize estimate follow-ups. Use templates and reminders where they save your team time.',
    example: '<div class="mock-pipeline"><div><span class="pipe-dot"></span><span class="pipe-label">Brick repair inquiry<small>Review the project details</small></span><span class="pipe-status">New</span></div><div><span class="pipe-dot"></span><span class="pipe-label">Site visit conversation<small>Confirm availability with the owner</small></span><span class="pipe-status">Next step</span></div><div><span class="pipe-dot"></span><span class="pipe-label">Estimate follow-up<small>Check in after the agreed interval</small></span><span class="pipe-status">Planned</span></div></div>',
    note: 'This is an illustrative workflow. Your proposal defines the tools, setup, and ongoing responsibilities.'
  }
};

function setStage(key, moveFocus = false) {
  if (!stages[key]) return;
  $$('.stage-tab').forEach(tab => {
    const active = tab.dataset.stage === key;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && moveFocus) tab.focus();
  });
  const stage = stages[key];
  $('#stage-title').textContent = stage.title;
  $('#stage-description').textContent = stage.description;
  $('#stage-example').innerHTML = stage.example;
  $('#stage-note').textContent = stage.note;
  $('#stage-panel').setAttribute('aria-labelledby', `tab-${key}`);
}
$$('.stage-tab').forEach((tab, index, tabs) => {
  tab.addEventListener('click', () => setStage(tab.dataset.stage));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      setStage(tabs[next].dataset.stage, true);
    }
  });
});
$$('[data-open-stage]').forEach(link => link.addEventListener('click', () => setStage(link.dataset.openStage)));
setStage('found');

const themeButton = $('.theme-toggle');
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  $('meta[name="theme-color"]').content = theme === 'dark' ? '#0a1119' : '#f7f8f4';
}
try { setTheme(localStorage.getItem('pd-masonry-theme') === 'light' ? 'light' : 'dark'); } catch { setTheme('dark'); }
themeButton.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  try { localStorage.setItem('pd-masonry-theme', next); } catch { /* Theme still works without storage. */ }
});

const menuButton = $('.menu-toggle');
const mobileNav = $('.mobile-nav');
function closeMenu() {
  mobileNav.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  mobileNav.hidden = !open;
});
$$('a', mobileNav).forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
window.matchMedia('(min-width: 801px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

const projects = {
  repair: { title: 'Brick repair', photo: 'Close-up + full wall', note: 'Mortar is wearing away around the front steps. Looking for a repair that matches the existing brickwork.', next: 'Review the photos and arrange a callback', detail: 'Confirm the affected area, access, and whether a site visit is needed.' },
  wall: { title: 'Retaining wall', photo: 'Full site + slope', note: 'Planning a retaining wall along a sloped side yard. Need advice on the layout, drainage, and the next steps.', next: 'Clarify the site and scope', detail: 'Discuss the proposed height, site conditions, and whether specialist review is needed.' },
  new: { title: 'New brickwork', photo: 'Site + plans, if available', note: 'A new front porch needs brick columns and steps. Interested in discussing materials, scope, and project timing.', next: 'Arrange a project conversation', detail: 'Review any plans, access requirements, materials, and the construction schedule.' }
};
let currentProject = 'repair';
let showFollow = false;
function updateInquiry() {
  const project = projects[currentProject];
  $('#lead-project').textContent = project.title;
  $('#lead-location').textContent = $('#demo-location').value;
  $('#lead-timing').textContent = $('#demo-timing').value;
  $('#lead-photo').textContent = project.photo;
  $('#lead-note').textContent = project.note;
  $('#lead-status').textContent = showFollow ? 'Next step planned' : 'New inquiry';
  $('#next-step strong').textContent = showFollow ? project.next : 'Ready for a useful callback';
  $('#next-step p').textContent = showFollow ? project.detail : 'Key details together in one place.';
  $('#demo-follow').innerHTML = showFollow ? 'Reset the example <span aria-hidden="true">↺</span>' : 'Show the next step <span aria-hidden="true">→</span>';
}
$$('.choice').forEach(button => button.addEventListener('click', () => {
  currentProject = button.dataset.project;
  showFollow = false;
  $$('.choice').forEach(choice => {
    const selected = choice === button;
    choice.classList.toggle('active', selected);
    choice.setAttribute('aria-pressed', String(selected));
  });
  updateInquiry();
}));
$('#demo-location').addEventListener('change', updateInquiry);
$('#demo-timing').addEventListener('change', updateInquiry);
$('#demo-follow').addEventListener('click', () => { showFollow = !showFollow; updateInquiry(); });


// Growth review submission
async function submitGrowthReview(event) {
  event.preventDefault();
  const form = event.currentTarget || event.target;
  if (form.hidden || form.dataset.submitting === 'true' || !form.reportValidity()) return;
  const button = document.getElementById('review-submit');
  const status = document.getElementById('review-status');
  const success = document.getElementById('review-success');
  const original = button.textContent;
  const data = new FormData(form);
  data.set('message', 'Source: Masonry contractor websites — Proactive Digital\n\n' + String(data.get('message') || '').trim());
  form.dataset.submitting = 'true';
  form.setAttribute('aria-busy', 'true');
  button.disabled = true;
  button.textContent = 'Sending your request…';
  status.textContent = 'Sending your growth review request…';
  try {
    const response = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data).toString()
    });
    if (!response.ok) throw new Error('Request not accepted');
    form.hidden = true;
    form.removeAttribute('aria-busy');
    success.hidden = false;
    success.focus();
    status.textContent = '';
    try { window.pdAnalytics?.event('generate_lead'); } catch (_) { /* Measurement must not interrupt a received request. */ }
  } catch (_) {
    form.dataset.submitting = 'false';
    form.removeAttribute('aria-busy');
    button.disabled = false;
    button.textContent = original;
    status.textContent = 'Your request could not be sent. Please try again or email hello@getproactivedigital.com.';
  }
}
document.getElementById('review-form').addEventListener('submit', submitGrowthReview);
