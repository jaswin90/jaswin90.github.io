// The Admin page (/admin/): visible to the admin only.
//   - Invites: who may sign in to the library and the apps.
//   - Visitors: a dashboard of site traffic from Google Analytics 4 (the GA4 property linked to
//     the site's Firebase project). Data comes from the Google Analytics Data API, read with the
//     admin's own Google account (scope analytics.readonly), so no keys are stored anywhere.
import { firebaseConfig } from '/assets/js/firebase-config.js';
import { firebase, configured, onSession, ADMIN_EMAIL, norm, listInvites, addInvite, removeInvite } from '/assets/js/site-auth.js';

const root = document.getElementById('admin');
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const PROJECT = (firebaseConfig && firebaseConfig.projectId) || '';
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-GB');
let token = null;   // { value, expiresAt } — in memory only
let fb = null;      // Firebase, loaded once on page load so the popup can open straight from the click

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ------------------------------------------------------------------ invites */
// The site sends no email itself (the free Firebase plan has no mail service). After inviting,
// the admin gets a ready-made message to send from their own email.
const SITE = location.origin;
function inviteMessage(email) {
  const subject = 'You are invited to Jaswin\'s library';
  const body = 'Hi,\n\nI have added ' + email + ' to my library and apps.\n\n' +
    '1. Open ' + SITE + '/library/\n' +
    '2. Click "Sign in" at the top right and choose your Google account (' + email + ').\n\n' +
    'Books: ' + SITE + '/library/\nApps (My Planner): ' + SITE + '/apps/planner/\n\n' +
    'If Google shows "Google hasn\'t verified this app", click Advanced, then Go to the site.\n\nJaswin';
  return { subject, body };
}
function sendLinks(email) {
  const m = inviteMessage(email);
  const gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(email) + '&su=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body);
  const mailto = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(m.body);
  // On phones Gmail's website cannot open a pre-filled draft, so the button opens the mail app (Gmail app) instead.
  const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return (phone ? '<a class="btn small primary" href="' + esc(mailto) + '">Send invite email</a> '
                : '<a class="btn small primary" target="_blank" rel="noopener" href="' + esc(gmail) + '">Send invite email (Gmail)</a> ') +
    (phone ? '' : '<a class="btn small" href="' + esc(mailto) + '">Other mail app</a> ') +
    '<button class="btn small" type="button" data-copy="' + esc(email) + '">Copy message</button>';
}

function invitesSection(box) {
  box.innerHTML = '<h2>Invites</h2><p class="small muted">People on this list can sign in to the library and the apps with their Google account. You are always allowed. Adding someone does not email them: use <b>Send invite email</b> next to their name (or Copy message) to let them know.</p>' +
    '<div class="inv-list"><p class="small muted">Loading…</p></div>' +
    '<form class="auth-form inv-form" novalidate><label>Email<input name="email" type="email" required placeholder="name@gmail.com"></label>' +
    '<label>Note (optional)<input name="note" type="text"></label><p class="auth-err" role="alert" hidden></p>' +
    '<button class="btn primary" type="submit">Invite</button></form>';
  const list = box.querySelector('.inv-list'), form = box.querySelector('form'), err = form.querySelector('.auth-err');
  const draw = async () => {
    try {
      const items = await listInvites();
      list.innerHTML = items.length ? '<ul class="inv-ul">' + items.map((i) => '<li><span>' + esc(i.email) + (i.note ? ' <span class="muted small">' + esc(i.note) + '</span>' : '') +
        '</span><span class="inv-actions">' + sendLinks(i.email) + ' <button class="btn small" data-rm="' + esc(i.email) + '">Remove</button></span></li>').join('') + '</ul>' : '<p class="small muted">No invites yet.</p>';
      list.querySelectorAll('[data-copy]').forEach((x) => x.addEventListener('click', async () => {
        const m = inviteMessage(x.dataset.copy);
        try { await navigator.clipboard.writeText(m.subject + '\n\n' + m.body); toast('Message copied. Paste it into WhatsApp, email or anywhere.'); }
        catch (e) { prompt('Copy this message:', m.body); }
      }));
      list.querySelectorAll('[data-rm]').forEach((x) => x.addEventListener('click', async () => {
        if (!confirm('Remove ' + x.dataset.rm + ' from the invite list?')) return;
        try { await removeInvite(x.dataset.rm); toast('Removed ' + x.dataset.rm); draw(); } catch (e) { toast(e.message); }
      }));
    } catch (e) {
      list.innerHTML = '<p class="auth-err">Could not read invites (' + esc(e.code || e.message) + ').' + (/permission/i.test(e.code || e.message)
        ? ' The database refuses: the access rules are not published yet. Firebase console → Firestore Database → Rules: paste the rules from <code>firestore.rules</code> and click Publish.' : '') + '</p>';
    }
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.hidden = true;
    if (!form.email.value.trim()) { err.textContent = 'Type the new person\'s email address first. To email someone already on the list, use Send invite email next to their name.'; err.hidden = false; return; }
    try { const em = await addInvite(form.email.value, form.note.value); form.reset(); toast('Added ' + em + '. Now click Send invite email next to their name.'); draw(); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
  });
  draw();
}

/* ------------------------------------------------------------------ analytics */
/** Must be called directly from a click, with nothing awaited before it, or browsers block the popup. */
async function getToken() {
  if (token && token.expiresAt - Date.now() > 60000) return token.value;
  const { A, auth } = fb;
  const provider = new A.GoogleAuthProvider();
  provider.addScope(SCOPE);
  provider.setCustomParameters({ login_hint: ADMIN_EMAIL });
  const result = await A.reauthenticateWithPopup(auth.currentUser, provider);
  const cred = A.GoogleAuthProvider.credentialFromResult(result);
  if (!cred || !cred.accessToken) throw new Error('Google did not return access to Analytics.');
  token = { value: cred.accessToken, expiresAt: Date.now() + 55 * 60 * 1000 };
  return token.value;
}

async function api(url, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + await getToken() }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((j.error && j.error.message) || ('HTTP ' + res.status));
    e.status = res.status; e.reason = JSON.stringify(j.error || {});
    throw e;
  }
  return j;
}

/** Find the GA4 property whose web stream has this site's measurement ID. */
async function findProperty(measurementId) {
  const cached = localStorage.getItem('admin.ga.property');
  if (cached) return cached;
  const sums = await api(ADMIN_API + '/accountSummaries?pageSize=200');
  for (const acc of sums.accountSummaries || []) {
    for (const p of acc.propertySummaries || []) {
      const streams = await api(ADMIN_API + '/' + p.property + '/dataStreams');
      if ((streams.dataStreams || []).some((s) => s.webStreamData && s.webStreamData.measurementId === measurementId)) {
        try { localStorage.setItem('admin.ga.property', p.property); } catch (e) { /* ignore */ }
        return p.property;
      }
    }
  }
  throw new Error('No Google Analytics property for this site is visible to this Google account.');
}

const report = (prop, body) => api(DATA_API + '/' + prop + ':runReport', body);
const rows = (r) => (r.rows || []).map((x) => ({ d: (x.dimensionValues || []).map((v) => v.value), m: (x.metricValues || []).map((v) => Number(v.value)) }));

function lineChart(points) {
  if (!points.length) return '<p class="small muted">No data yet for this period.</p>';
  const W = 720, H = 200, P = 28, max = Math.max(1, ...points.map((p) => p.v));
  const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, points.length - 1);
  const y = (v) => H - P - (v * (H - 2 * P)) / max;
  const path = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' ');
  const lab = (p) => p.k.slice(6, 8) + '/' + p.k.slice(4, 6);
  return '<svg class="dash-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Page views per day">' +
    '<line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" stroke="var(--border)"/>' +
    '<text x="' + P + '" y="14" font-size="11" fill="var(--muted)">max ' + fmt(max) + ' views/day</text>' +
    '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2"/>' +
    '<text x="' + P + '" y="' + (H - 8) + '" font-size="11" fill="var(--muted)">' + lab(points[0]) + '</text>' +
    '<text x="' + (W - P) + '" y="' + (H - 8) + '" font-size="11" fill="var(--muted)" text-anchor="end">' + lab(points[points.length - 1]) + '</text></svg>';
}
const table = (title, head, list) => '<div class="dash-card"><h3>' + esc(title) + '</h3>' + (list.length ?
  '<table class="dash-table"><thead><tr><th>' + esc(head[0]) + '</th><th>' + esc(head[1]) + '</th></tr></thead><tbody>' +
  list.map((r) => '<tr><td>' + esc(r.d[0] || '(not set)') + '</td><td>' + fmt(r.m[0]) + '</td></tr>').join('') + '</tbody></table>' : '<p class="small muted">No data yet.</p>') + '</div>';

function setupHelp(extra) {
  return '<div class="notice-box"><p><b>To turn the dashboard on (one time):</b></p><ol>' +
    '<li>Firebase console → Project settings → Integrations → <b>Google Analytics</b> → Enable (creates the GA4 property and a <code>measurementId</code>).</li>' +
    '<li>Copy the web app config again (Project settings → Your apps; it now includes <code>measurementId</code>) into the <code>FIREBASE_CONFIG</code> secret, and re-run the deploy.</li>' +
    '<li>Google Cloud console (this Firebase project): enable <b>Google Analytics Data API</b> and <b>Google Analytics Admin API</b>; in Google Auth Platform → Data access, add the scope <code>analytics.readonly</code>.</li>' +
    '</ol>' + (extra ? '<p class="small muted">' + extra + '</p>' : '') + '</div>';
}

function dashboardSection(box) {
  const mid = firebaseConfig && firebaseConfig.measurementId;
  box.innerHTML = '<h2>Visitors</h2>' + (mid ? '<p class="small muted">Daily figures lag by up to a day; "Active now" is live.</p>' +
    '<div class="row-tools"><label class="small">Period <select id="dash-range"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select></label>' +
    ' <button class="btn primary" id="dash-load">Load dashboard</button></div><div id="dash-out"></div>' : setupHelp('The site build has no measurement ID yet, so visits are not being counted.'));
  if (!mid) return;
  const out = box.querySelector('#dash-out');
  box.querySelector('#dash-load').addEventListener('click', async () => {
    const days = Number(box.querySelector('#dash-range').value);
    try {
      await getToken();   // first, while the click still counts as a user gesture
    } catch (e) {
      const code = (e && e.code) || '';
      out.innerHTML = '<p class="auth-err">' + (code === 'auth/popup-blocked'
        ? 'Your browser blocked the Google window. Allow pop-ups for jaswin90.github.io (icon at the right of the address bar), then click Load dashboard again.'
        : code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
          ? 'The Google window was closed before finishing. Click Load dashboard and complete it.'
          : 'Google sign-in for Analytics failed: ' + esc(code || e.message)) + '</p>';
      return;
    }
    out.innerHTML = '<p class="small muted">Loading…</p>';
    try {
      const prop = await findProperty(mid);
      const range = [{ startDate: days + 'daysAgo', endDate: 'today' }];
      const [totals, daily, pages, countries, sources, live] = await Promise.all([
        report(prop, { dateRanges: range, metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }, { name: 'newUsers' }] }),
        report(prop, { dateRanges: range, dimensions: [{ name: 'date' }], metrics: [{ name: 'screenPageViews' }], orderBys: [{ dimension: { dimensionName: 'date' } }] }),
        report(prop, { dateRanges: range, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 15 }),
        report(prop, { dateRanges: range, dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 10 }),
        report(prop, { dateRanges: range, dimensions: [{ name: 'sessionSource' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 }),
        api(DATA_API + '/' + prop + ':runRealtimeReport', { metrics: [{ name: 'activeUsers' }] }),
      ]);
      const t = rows(totals)[0] || { m: [0, 0, 0, 0] };
      const now = (rows(live)[0] || { m: [0] }).m[0];
      out.innerHTML = '<div class="kpis">' +
        [['Visitors', t.m[0]], ['Page views', t.m[1]], ['Sessions', t.m[2]], ['New visitors', t.m[3]], ['Active now', now]]
          .map(([k, v]) => '<div class="kpi"><div class="kpi-v">' + fmt(v) + '</div><div class="kpi-k small muted">' + k + '</div></div>').join('') + '</div>' +
        '<div class="dash-card"><h3>Page views per day</h3>' + lineChart(rows(daily).map((r) => ({ k: r.d[0], v: r.m[0] }))) + '</div>' +
        '<div class="dash-grid">' + table('Top pages', ['Page', 'Views'], rows(pages)) + table('Countries', ['Country', 'Visitors'], rows(countries)) +
        table('Where visitors come from', ['Source', 'Sessions'], rows(sources)) + '</div>';
    } catch (e) {
      const disabled = /SERVICE_DISABLED|has not been used|is disabled/i.test(e.reason || e.message);
      const scope = e.status === 403 && /scope|insufficient/i.test(e.reason || e.message);
      out.innerHTML = '<p class="auth-err">Could not load the dashboard: ' + esc(e.message) + '</p>' +
        (disabled || scope ? setupHelp(disabled ? 'One of the Analytics APIs is not enabled yet.' : 'The analytics.readonly scope is not granted yet.') : '');
    }
  });
}

/* ------------------------------------------------------------------ page */
async function main() {
  if (!configured()) { root.innerHTML = '<p class="small muted">Accounts are not enabled on this build.</p>'; return; }
  fb = await firebase();
  await onSession(({ user, admin }) => {
    if (!user || !admin || norm(user.email) !== ADMIN_EMAIL) {
      root.innerHTML = '<p>This page is for the site\'s administrator. ' + (user ? '' : 'Sign in with the admin account (top right).') + '</p>';
      return;
    }
    root.innerHTML = '<section class="admin-sec" id="visitors"></section><section class="admin-sec" id="invites"></section>';
    dashboardSection(root.querySelector('#visitors'));
    invitesSection(root.querySelector('#invites'));
  });
}
main().catch((e) => { console.error(e); root.innerHTML = '<p class="small muted">Could not load: ' + esc(e.message) + '</p>'; });
