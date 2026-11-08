// The site's account control: one element at the right of the top bar on the Library and Apps
// pages. Signed out: a "Sign in" button (Google accounts only, invite-only). Signed in: your
// picture and name, with a menu for My progress, Invites (admin only) and Sign out.
// Books link here to sign in (/library/?signin=1&next=<page>) and are returned afterwards.
import { firebase, configured, isInvited, norm, ADMIN_EMAIL, listInvites, addInvite, removeInvite } from '/assets/js/site-auth.js';

const slot = document.getElementById('account-slot');
const progressBox = document.getElementById('progress');           // only on /library/
const booksEl = document.getElementById('library-books');
const BOOKS = booksEl ? JSON.parse(booksEl.textContent) : [];
const params = new URLSearchParams(location.search);
const NEXT = (() => { const n = params.get('next') || ''; return n.startsWith('/') && !n.startsWith('//') ? n : ''; })();
const OWNER = 'Jaswin';

const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 3500);
}
const MESSAGES = {
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
  'auth/cancelled-popup-request': 'The Google window was closed before signing in.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/operation-not-allowed': 'Google sign-in is not enabled for this site yet (Firebase → Authentication → Sign-in method → Google).',
  'auth/unauthorized-domain': 'This site is not authorised for sign-in yet (Firebase → Authentication → Settings → Authorized domains: add jaswin90.github.io).',
};
const BLOCKED = 'Your browser blocked the Google sign-in window. Allow pop-ups for jaswin90.github.io and try again. If you opened this link inside an app (WhatsApp, Gmail, LinkedIn…), open it in Chrome or Safari instead.';
const msgOf = (e) => MESSAGES[e && e.code] || ('Something went wrong (' + ((e && (e.code || e.message)) || 'unknown') + ').');

/* ---------------------------------------------------------------- dialog */
let dlg = null;
function show(html) {
  if (!dlg) {
    dlg = document.createElement('div'); dlg.className = 'auth-modal'; dlg.hidden = true;
    dlg.innerHTML = '<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button class="auth-x" aria-label="Close" data-act="close">×</button><div class="auth-body"></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || (e.target.dataset && e.target.dataset.act === 'close')) dlg.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dlg && !dlg.hidden) dlg.hidden = true; });
  }
  const b = dlg.querySelector('.auth-body'); b.innerHTML = html; dlg.hidden = false;
  const f = b.querySelector('input, button.primary'); if (f) setTimeout(() => f.focus(), 30);
  return b;
}
const closeDialog = () => { if (dlg) dlg.hidden = true; };
const setErr = (box, m) => { const e = box.querySelector('.auth-err'); if (e) { e.textContent = m; e.hidden = !m; } };

async function main() {
  if (!slot) return;
  if (!configured()) { slot.innerHTML = ''; return; }
  slot.innerHTML = '<button class="btn" type="button" disabled>Sign in</button>';   // reserve the place while Firebase loads
  const { A, F, auth, db } = await firebase();
  const provider = new A.GoogleAuthProvider();
  let denied = '';

  function signInDialog(note) {
    const b = show('<h2 id="auth-title">Sign in</h2>' +
      '<p class="small muted">' + (note ? esc(note) + ' ' : '') + 'Use your Google (Gmail) account. Accounts are invite-only; reading the books needs no account.</p>' +
      '<p class="auth-err" role="alert" hidden></p>' +
      '<button type="button" class="btn primary auth-wide" data-act="google">Continue with Google</button>');
    b.querySelector('[data-act=google]').addEventListener('click', async () => {
      setErr(b, '');
      try { await A.signInWithPopup(auth, provider); closeDialog(); }
      catch (e) {
        // Redirect sign-in is not used: with the site on jaswin90.github.io and Firebase on
        // firebaseapp.com, browsers' storage partitioning breaks it.
        if (e && ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) setErr(b, BLOCKED);
        else setErr(b, msgOf(e));
      }
    });
  }

  function deniedDialog(email) {
    show('<h2 id="auth-title">Invite-only for now</h2>' +
      '<p><b>' + esc(email) + '</b> is not on the invite list.</p>' +
      '<p class="small muted">You can still read every book; your progress is saved in this browser. Ask ' + OWNER + ' for an invite, then sign in again.</p>' +
      '<button type="button" class="btn auth-wide" data-act="close">OK</button>');
  }

  async function invitesDialog() {
    const b = show('<h2 id="auth-title">Invites</h2><p class="small muted">People on this list can sign in to the library and the apps. You are always allowed.</p><div class="inv-list"><p class="small muted">Loading…</p></div>' +
      '<form class="auth-form" novalidate><label>Email<input name="email" type="email" required></label>' +
      '<label>Note (optional)<input name="note" type="text"></label><p class="auth-err" role="alert" hidden></p>' +
      '<button class="btn primary auth-wide" type="submit">Invite</button></form>');
    const list = b.querySelector('.inv-list');
    const draw = async () => {
      try {
        const items = await listInvites();
        list.innerHTML = items.length ? '<ul class="inv-ul">' + items.map((i) => '<li><span>' + esc(i.email) + (i.note ? ' <span class="muted small">' + esc(i.note) + '</span>' : '') +
          '</span><button class="btn small" data-rm="' + esc(i.email) + '">Remove</button></li>').join('') + '</ul>' : '<p class="small muted">No invites yet.</p>';
        list.querySelectorAll('[data-rm]').forEach((x) => x.addEventListener('click', async () => {
          if (!confirm('Remove ' + x.dataset.rm + ' from the invite list?')) return;
          try { await removeInvite(x.dataset.rm); toast('Removed ' + x.dataset.rm); draw(); } catch (e) { toast(msgOf(e)); }
        }));
      } catch (e) { list.innerHTML = '<p class="auth-err">Could not read invites (' + esc(e.code || e.message) + '). Have the Firestore rules been published?</p>'; }
    };
    const f = b.querySelector('form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); setErr(f, '');
      try { const em = await addInvite(f.email.value, f.note.value); f.reset(); toast('Invited ' + em); draw(); } catch (x) { setErr(f, x.message || msgOf(x)); }
    });
    draw();
  }

  async function progressHtml(user) {
    try {
      const snap = await F.getDoc(F.doc(db, 'users', user.uid));
      const d = snap.exists() ? snap.data() : {};
      return '<ul class="lib-progress">' + BOOKS.map((b) => {
        const rec = b.progress_field ? d[b.progress_field] : d;
        const n = rec && rec.items ? Object.keys(rec.items).length : 0;
        return '<li><a href="' + esc(b.url) + '">' + esc(b.title) + '</a> <span class="muted small">' + (n ? n + (n === 1 ? ' question' : ' questions') + ' answered' : 'not started') + '</span></li>';
      }).join('') + '</ul>';
    } catch (e) { return '<p class="small muted">Progress summary unavailable (' + esc(e.code || e.message) + ').</p>'; }
  }

  function chip(user, admin) {
    const first = (user.displayName || user.email || 'You').split(' ')[0];
    slot.innerHTML = '<div class="acct">' +
      '<button class="btn acct-btn" aria-haspopup="true" aria-expanded="false">' +
      (user.photoURL ? '<img alt="" referrerpolicy="no-referrer" src="' + esc(user.photoURL) + '">' : '<span class="acct-initial">' + esc(first[0] || '?') + '</span>') +
      '<span class="acct-name">' + esc(first) + '</span> ▾</button>' +
      '<div class="acct-menu" hidden><div class="acct-who small muted">' + esc(user.email) + '</div>' +
      '<a href="/library/#progress">My progress</a>' +
      (admin ? '<button type="button" data-act="invites">Invites</button>' : '') +
      '<button type="button" data-act="signout">Sign out</button></div></div>';
    const btn = slot.querySelector('.acct-btn'), menu = slot.querySelector('.acct-menu');
    const set = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(menu.hidden); });
    document.addEventListener('click', (e) => { if (!slot.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    const inv = menu.querySelector('[data-act=invites]'); if (inv) inv.addEventListener('click', () => { set(false); invitesDialog(); });
    menu.querySelector('[data-act=signout]').addEventListener('click', async () => { set(false); await A.signOut(auth); toast('Signed out. Your progress stays in this browser.'); });
  }

  function signedOut() {
    slot.innerHTML = '<button class="btn" id="acct-signin" type="button">Sign in</button>';
    slot.querySelector('#acct-signin').addEventListener('click', () => signInDialog());
    if (progressBox) progressBox.innerHTML = '<p class="small muted">Reading needs no account. To keep your progress in every book on every device, <a href="#" id="prog-signin">sign in</a> (invite-only); otherwise it is saved in this browser.</p>';
    const l = document.getElementById('prog-signin'); if (l) l.addEventListener('click', (e) => { e.preventDefault(); signInDialog(); });
  }

  A.onAuthStateChanged(auth, async (user) => {
    if (!user) {
      signedOut();
      if (denied) { deniedDialog(denied); denied = ''; }
      else if (params.get('signin')) signInDialog(NEXT ? 'Sign in to keep your progress, then you will go back to where you were.' : '');
      return;
    }
    if (!(await isInvited(user))) { denied = user.email || ''; await A.signOut(auth); return; }
    if (NEXT) { location.replace(NEXT); return; }
    const admin = norm(user.email) === ADMIN_EMAIL;
    chip(user, admin);
    if (progressBox) progressBox.innerHTML = '<p class="small muted">Signed in as ' + esc(user.email) + '. Every book and app uses this account.</p>' + await progressHtml(user);
  });
}

main().catch((e) => {
  console.error(e);
  if (!slot) return;
  slot.innerHTML = '<button class="btn" type="button">Sign in</button>';
  slot.firstChild.addEventListener('click', () => toast('Accounts could not load (offline?). Reading still works; progress is saved in this browser.'));
  if (progressBox) progressBox.innerHTML = '<p class="small muted">Accounts could not load. Your progress is saved in this browser.</p>';
});
