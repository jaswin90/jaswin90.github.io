// The library's account panel: the only place in the site where readers sign in,
// create an account, confirm their email, reset a password or sign out.
// Books in the library share this Firebase project and the same browser session,
// so once a reader signs in here every book syncs its progress automatically.
import { firebase, configured, isInvited, norm, ADMIN_EMAIL, listInvites, addInvite, removeInvite } from '/assets/js/site-auth.js';
const panel = document.getElementById('account');
const BOOKS = JSON.parse(document.getElementById('library-books').textContent);
const params = new URLSearchParams(location.search);
const NEXT = (() => { const n = params.get('next') || ''; return n.startsWith('/') && !n.startsWith('//') ? n : ''; })();

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const isPasswordUser = u => !!u && (u.providerData || []).some(p => p.providerId === 'password');
const needsConfirm = u => !!u && isPasswordUser(u) && !u.emailVerified;
const OWNER = 'Jaswin';
let denied = '';   // email of an uninvited sign-in, to explain after signing them out
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 3200);
}
const MESSAGES = {
  'auth/invalid-email': 'That email address does not look right.',
  'auth/missing-password': 'Please enter a password.',
  'auth/weak-password': 'Choose a password of at least 8 characters.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead, or reset the password.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'No account with this email. Create one instead.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled yet.',
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
  'auth/unauthorized-domain': 'This site is not yet authorised for sign-in (Firebase → Authentication → Settings → Authorized domains: add jaswin90.github.io).'
};
const msgOf = e => MESSAGES[e && e.code] || ('Something went wrong (' + ((e && (e.code || e.message)) || 'unknown') + ').');

async function main() {
  if (!configured()) { panel.innerHTML = '<p class="small muted">Accounts are not enabled on this build. Progress is saved in this browser.</p>'; return; }
  const { A, F, auth, db } = await firebase();
  const provider = new A.GoogleAuthProvider();
  const returnUrl = () => location.origin + location.pathname + (NEXT ? '?next=' + encodeURIComponent(NEXT) : '');

  /* ------------------------------------------------------------- dialog */
  let dlg = null;
  function dialog() {
    if (dlg) return dlg;
    dlg = document.createElement('div'); dlg.className = 'auth-modal'; dlg.hidden = true;
    dlg.innerHTML = '<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button class="auth-x" aria-label="Close" data-act="close">×</button><div class="auth-body"></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg || (e.target.dataset && e.target.dataset.act === 'close')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlg.hidden) close(); });
    return dlg;
  }
  function show(html, focus) {
    const d = dialog(); const b = d.querySelector('.auth-body'); b.innerHTML = html; d.hidden = false;
    const f = b.querySelector(focus || 'input'); if (f) setTimeout(() => f.focus(), 30);
    return b;
  }
  function close() { if (dlg) dlg.hidden = true; }
  const err = (b, m) => { const e = b.querySelector('.auth-err'); if (!e) return; e.textContent = m; e.hidden = !m; };
  const busy = (form, on, label) => { const s = form.querySelector('button[type=submit]'); if (s) { s.disabled = on; s.textContent = on ? 'Please wait…' : label; } };
  const google = '<div class="auth-or"><span>or</span></div><button type="button" class="btn auth-wide" data-act="google">Continue with Google</button>';

  // Google accounts only: no passwords to manage, and Google has already verified the email.
  function viewSignIn() {
    const b = show('<h2 id="auth-title">Sign in</h2>' +
      '<p class="small muted">Use your Google (Gmail) account. Accounts are invite-only.</p>' +
      '<p class="auth-err" role="alert" hidden></p>' +
      '<button type="button" class="btn primary auth-wide" data-act="google">Continue with Google</button>', 'button');
    wire(b, () => '');
  }
  function viewConfirm(user) {
    const b = show('<h2 id="auth-title">Confirm your email</h2>' +
      '<p>We sent a confirmation link to <b>' + esc(user.email) + '</b>. Open it (check the spam folder too), then press the button below.</p>' +
      '<p class="auth-err" role="alert" hidden></p>' +
      '<button class="btn primary auth-wide" data-act="check">I have confirmed</button>' +
      '<p class="small"><a href="#" data-act="resend">Resend the email</a> · <a href="#" data-act="signout">Use a different account</a></p>', 'button');
    b.querySelector('[data-act=check]').addEventListener('click', async () => {
      err(b, '');
      try {
        await A.reload(user);
        if (auth.currentUser && auth.currentUser.emailVerified) { await auth.currentUser.getIdToken(true); close(); render(auth.currentUser); }
        else err(b, 'Not confirmed yet. Open the link in the email first; it can take a minute to arrive.');
      } catch (x) { err(b, msgOf(x)); }
    });
    b.querySelector('[data-act=resend]').addEventListener('click', async e => {
      e.preventDefault();
      try { await A.sendEmailVerification(user, { url: returnUrl() }); toast('Confirmation email sent again'); } catch (x) { err(b, msgOf(x)); }
    });
    b.querySelector('[data-act=signout]').addEventListener('click', async e => { e.preventDefault(); await A.signOut(auth); viewSignIn(''); });
  }
  function wire(b, getEmail) {
    b.querySelectorAll('[data-act]').forEach(x => {
      const act = x.dataset.act;
      if (act === 'to-signin') x.addEventListener('click', e => { e.preventDefault(); viewSignIn(getEmail()); });
      if (act === 'google') x.addEventListener('click', async () => {
        try { await A.signInWithPopup(auth, provider); close(); }
        catch (e) {
          // Redirect sign-in is not used: on a site whose domain differs from Firebase's
          // (jaswin90.github.io vs firebaseapp.com) browsers' storage partitioning breaks it.
          if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment' || e.code === 'auth/web-storage-unsupported')) {
            err(b, 'Your browser blocked the Google sign-in window. Allow pop-ups for jaswin90.github.io and try again. If you opened this link inside an app (WhatsApp, Gmail, LinkedIn…), open it in Chrome or Safari instead.');
          } else err(b, msgOf(e));
        }
      });
    });
  }

  /* ------------------------------------------------------------- panel */
  function countOf(rec) { return rec && rec.items ? Object.keys(rec.items).length : 0; }
  async function progressHtml(user) {
    try {
      const snap = await F.getDoc(F.doc(db, 'users', user.uid));
      const d = snap.exists() ? snap.data() : {};
      return '<ul class="lib-progress">' + BOOKS.map(b => {
        const rec = b.progress_field ? d[b.progress_field] : d;
        const n = countOf(rec);
        return '<li><a href="' + esc(b.url) + '">' + esc(b.title) + '</a> <span class="muted small">' + (n ? n + ' questions answered' : 'not started') + '</span></li>';
      }).join('') + '</ul>';
    } catch (e) { return '<p class="small muted">Signed in. (Progress summary unavailable: ' + esc(e.code || e.message) + ')</p>'; }
  }
  async function render(user) {
    if (!user && denied) {
      panel.innerHTML = '<p>The library\'s accounts are <b>invite-only</b> for now, and <b>' + esc(denied) + '</b> is not on the list.</p>' +
        '<p class="small muted">You can still read every book; your progress is saved in this browser. Ask ' + OWNER + ' for an invite, then sign in again.</p>' +
        '<p><button class="btn" id="lib-signin">Sign in with another account</button></p>';
      document.getElementById('lib-signin').addEventListener('click', () => { denied = ''; viewSignIn(''); });
      return;
    }
    if (!user) {
      panel.innerHTML = '<p>Sign in to keep your progress in every book on every device, and to use the apps. Accounts are <b>invite-only</b> for now. Without an account, progress is saved in this browser only.</p>' +
        '<p><button class="btn primary" id="lib-signin">Sign in with Google</button></p>';
      document.getElementById('lib-signin').addEventListener('click', () => viewSignIn(''));
      return;
    }
    if (needsConfirm(user)) {
      panel.innerHTML = '<p>Signed in as <b>' + esc(user.email) + '</b>. Confirm your email to start syncing.</p><p><button class="btn primary" id="lib-confirm">Confirm email</button> <button class="btn" id="lib-out">Sign out</button></p>';
      document.getElementById('lib-confirm').addEventListener('click', () => viewConfirm(user));
      document.getElementById('lib-out').addEventListener('click', () => A.signOut(auth));
      return;
    }
    if (!(await isInvited(user))) {
      denied = user.email || '';
      panel.innerHTML = '<p>The library\'s accounts are <b>invite-only</b> for now, and <b>' + esc(user.email) + '</b> is not on the list.</p>' +
        '<p class="small muted">You can still read every book; your progress is saved in this browser. Ask ' + OWNER + ' for an invite, then sign in again.</p>' +
        '<p><button class="btn" id="lib-out">Sign out</button></p>';
      document.getElementById('lib-out').addEventListener('click', () => A.signOut(auth));
      setTimeout(() => A.signOut(auth), 0);   // keep uninvited sessions from reaching the books
      return;
    }
    if (NEXT) { location.replace(NEXT); return; }
    const name = user.displayName || user.email || 'Reader';
    panel.innerHTML = '<p class="user-chip">' + (user.photoURL ? '<img alt="" referrerpolicy="no-referrer" src="' + esc(user.photoURL) + '">' : '') +
      '<span>Signed in as <b>' + esc(name) + '</b></span> <button class="btn small" id="lib-out">Sign out</button></p>' +
      '<p class="small muted">Every book in the library, and the apps, now use this account.</p><div id="lib-prog"></div>';
    document.getElementById('lib-out').addEventListener('click', async () => { await A.signOut(auth); toast('Signed out — progress stays in this browser.'); });
    document.getElementById('lib-prog').innerHTML = await progressHtml(user);
    if (norm(user.email) === ADMIN_EMAIL) adminPanel();
  }

  /* ------------------------------------------------------------- admin */
  async function adminPanel() {
    let box = document.getElementById('lib-admin');
    if (!box) { box = document.createElement('div'); box.id = 'lib-admin'; panel.appendChild(box); }
    const draw = async () => {
      let rows = '';
      try {
        const list = await listInvites();
        rows = list.length ? '<ul class="lib-progress">' + list.map(i => '<li>' + esc(i.email) + (i.note ? ' <span class="muted small">' + esc(i.note) + '</span>' : '') +
          ' <button class="btn small" data-rm="' + esc(i.email) + '">Remove</button></li>').join('') + '</ul>' : '<p class="small muted">No invites yet.</p>';
      } catch (e) { rows = '<p class="auth-err">Could not read invites (' + esc(e.code || e.message) + '). Have the Firestore rules been published?</p>'; }
      box.innerHTML = '<h3>Invites (admin)</h3><p class="small muted">People on this list can sign in to the library and the apps. You are always allowed.</p>' + rows +
        '<form id="inv-form" class="auth-form" novalidate style="max-width:28rem"><label>Email<input name="email" type="email" required></label>' +
        '<label>Note (optional)<input name="note" type="text"></label><p class="auth-err" role="alert" hidden></p>' +
        '<button class="btn primary" type="submit" style="margin-top:.6rem">Invite</button></form>';
      box.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Remove ' + b.dataset.rm + ' from the invite list?')) return;
        try { await removeInvite(b.dataset.rm); toast('Removed'); draw(); } catch (e) { toast(msgOf(e)); }
      }));
      const f = box.querySelector('#inv-form');
      f.addEventListener('submit', async e => {
        e.preventDefault(); err(f, '');
        try { const em = await addInvite(f.email.value, f.note.value); toast('Invited ' + em); draw(); } catch (x) { err(f, x.message || msgOf(x)); }
      });
    };
    draw();
  }

  A.onAuthStateChanged(auth, user => {
    render(user);
    if (!user && !denied && params.get('signin')) viewSignIn('');
  });
}
main().catch(e => { console.error(e); panel.innerHTML = '<p class="small muted">Could not load accounts: ' + esc(e.message) + '</p>'; });
