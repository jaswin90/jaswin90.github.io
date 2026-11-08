// The library's account panel: the only place in the site where readers sign in,
// create an account, confirm their email, reset a password or sign out.
// Books in the library share this Firebase project and the same browser session,
// so once a reader signs in here every book syncs its progress automatically.
import { firebaseConfig } from '../../assets/js/firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const panel = document.getElementById('account');
const BOOKS = JSON.parse(document.getElementById('library-books').textContent);
const params = new URLSearchParams(location.search);
const NEXT = (() => { const n = params.get('next') || ''; return n.startsWith('/') && !n.startsWith('//') ? n : ''; })();

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const isPasswordUser = u => !!u && (u.providerData || []).some(p => p.providerId === 'password');
const needsConfirm = u => !!u && isPasswordUser(u) && !u.emailVerified;
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
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.'
};
const msgOf = e => MESSAGES[e && e.code] || ('Something went wrong (' + ((e && (e.code || e.message)) || 'unknown') + ').');

async function main() {
  if (!firebaseConfig || !firebaseConfig.apiKey) { panel.innerHTML = '<p class="small muted">Accounts are not enabled. Progress is saved in this browser.</p>'; return; }
  const [{ initializeApp }, A, F] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
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

  function viewSignIn(email) {
    const b = show('<h2 id="auth-title">Sign in</h2>' +
      '<p class="small muted">New here? <a href="#" data-act="to-signup">Create an account</a></p>' +
      '<form class="auth-form" novalidate>' +
      '<label>Email<input name="email" type="email" autocomplete="email" required value="' + esc(email) + '"></label>' +
      '<label>Password<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<p class="auth-err" role="alert" hidden></p>' +
      '<button type="submit" class="btn primary auth-wide">Sign in</button>' +
      '<p class="small"><a href="#" data-act="to-reset">Forgot your password?</a></p></form>' + google);
    const form = b.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault(); err(b, ''); busy(form, true, 'Sign in');
      try { await A.signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value); close(); }
      catch (x) { err(b, msgOf(x)); }
      finally { busy(form, false, 'Sign in'); }
    });
    wire(b, () => form.email.value.trim());
  }
  function viewSignUp(email) {
    const b = show('<h2 id="auth-title">Create an account</h2>' +
      '<p class="small muted">Already have one? <a href="#" data-act="to-signin">Sign in</a></p>' +
      '<form class="auth-form" novalidate>' +
      '<label>Name<input name="name" type="text" autocomplete="name"></label>' +
      '<label>Email<input name="email" type="email" autocomplete="email" required value="' + esc(email) + '"></label>' +
      '<label>Password (at least 8 characters)<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>' +
      '<p class="auth-err" role="alert" hidden></p>' +
      '<button type="submit" class="btn primary auth-wide">Create account</button></form>' + google);
    const form = b.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault(); err(b, '');
      if (form.password.value.length < 8) { err(b, MESSAGES['auth/weak-password']); return; }
      busy(form, true, 'Create account');
      try {
        const cred = await A.createUserWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
        const name = form.name.value.trim(); if (name) await A.updateProfile(cred.user, { displayName: name });
        await A.sendEmailVerification(cred.user, { url: returnUrl() });
        viewConfirm(cred.user);
      } catch (x) { err(b, msgOf(x)); busy(form, false, 'Create account'); }
    });
    wire(b, () => form.email.value.trim());
  }
  function viewReset(email) {
    const b = show('<h2 id="auth-title">Reset your password</h2>' +
      '<form class="auth-form" novalidate><label>Email<input name="email" type="email" autocomplete="email" required value="' + esc(email) + '"></label>' +
      '<p class="auth-err" role="alert" hidden></p><button type="submit" class="btn primary auth-wide">Email me a reset link</button>' +
      '<p class="small"><a href="#" data-act="to-signin">Back to sign in</a></p></form>');
    const form = b.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault(); err(b, ''); busy(form, true, 'Email me a reset link');
      const em = form.email.value.trim();
      try {
        await A.sendPasswordResetEmail(auth, em, { url: returnUrl() });
        show('<h2 id="auth-title">Check your inbox</h2><p>If an account exists for <b>' + esc(em) + '</b>, a link to choose a new password is on its way. Check the spam folder too.</p>' +
          '<button class="btn primary auth-wide" data-act="to-signin">Back to sign in</button>', 'button');
        wire(dlg.querySelector('.auth-body'), () => em);
      } catch (x) { err(b, msgOf(x)); busy(form, false, 'Email me a reset link'); }
    });
    wire(b, () => form.email.value.trim());
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
      if (act === 'to-signup') x.addEventListener('click', e => { e.preventDefault(); viewSignUp(getEmail()); });
      if (act === 'to-signin') x.addEventListener('click', e => { e.preventDefault(); viewSignIn(getEmail()); });
      if (act === 'to-reset') x.addEventListener('click', e => { e.preventDefault(); viewReset(getEmail()); });
      if (act === 'google') x.addEventListener('click', async () => {
        try { await A.signInWithPopup(auth, provider); close(); }
        catch (e) {
          if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) await A.signInWithRedirect(auth, provider);
          else err(b, msgOf(e));
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
    if (!user) {
      panel.innerHTML = '<p>Sign in to keep your progress in every book of the library, on every device. Without an account, progress is saved in this browser only.</p>' +
        '<p><button class="btn primary" id="lib-signin">Sign in</button> <button class="btn" id="lib-signup">Create an account</button></p>';
      document.getElementById('lib-signin').addEventListener('click', () => viewSignIn(''));
      document.getElementById('lib-signup').addEventListener('click', () => viewSignUp(''));
      return;
    }
    if (needsConfirm(user)) {
      panel.innerHTML = '<p>Signed in as <b>' + esc(user.email) + '</b>. Confirm your email to start syncing.</p><p><button class="btn primary" id="lib-confirm">Confirm email</button> <button class="btn" id="lib-out">Sign out</button></p>';
      document.getElementById('lib-confirm').addEventListener('click', () => viewConfirm(user));
      document.getElementById('lib-out').addEventListener('click', () => A.signOut(auth));
      return;
    }
    if (NEXT) { location.replace(NEXT); return; }
    const name = user.displayName || user.email || 'Reader';
    panel.innerHTML = '<p class="user-chip">' + (user.photoURL ? '<img alt="" referrerpolicy="no-referrer" src="' + esc(user.photoURL) + '">' : '') +
      '<span>Signed in as <b>' + esc(name) + '</b></span> <button class="btn small" id="lib-out">Sign out</button></p>' +
      '<p class="small muted">Every book in the library now syncs your answers to this account.</p><div id="lib-prog"></div>';
    document.getElementById('lib-out').addEventListener('click', async () => { await A.signOut(auth); toast('Signed out — progress stays in this browser.'); });
    document.getElementById('lib-prog').innerHTML = await progressHtml(user);
  }

  A.onAuthStateChanged(auth, user => {
    render(user);
    if (!user && params.get('signin')) viewSignIn('');
  });
}
main().catch(e => { console.error(e); panel.innerHTML = '<p class="small muted">Could not load accounts: ' + esc(e.message) + '</p>'; });
