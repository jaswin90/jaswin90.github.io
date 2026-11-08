// Accounts (Firebase Auth: email + password with email confirmation, or Google)
// and progress sync (Cloud Firestore). Loaded as an ES module after book.js.
// If firebase-config.js is empty the book keeps working with browser-local
// progress and sync links only.
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const BookAuth = { configured: false, user: null, signIn() {}, signOut() {} };
window.BookAuth = BookAuth;

function whenBookReady() {
  return new Promise(res => { if (window.Book && document.querySelector('.topbar')) res(); else document.addEventListener('book:ready', () => res(), { once: true }); });
}
const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const isPasswordUser = u => !!u && (u.providerData || []).some(p => p.providerId === 'password');
const needsConfirm = u => !!u && isPasswordUser(u) && !u.emailVerified;

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
  'auth/operation-not-allowed': 'This sign-in method is not enabled for the book yet.',
  'auth/configuration-not-found': 'Accounts are still being set up for this book. Please try again later; your progress is saved in this browser meanwhile.',
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.'
};
const msgOf = e => MESSAGES[e && e.code] || ('Something went wrong (' + ((e && (e.code || e.message)) || 'unknown') + ').');

async function main() {
  await whenBookReady();
  const Book = window.Book;
  if (!firebaseConfig || !firebaseConfig.apiKey) { Book.renderAuth(null); rebindLocal(Book); return; }

  const [{ initializeApp }, A, F] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const provider = new A.GoogleAuthProvider();
  const returnUrl = () => location.origin + location.pathname;
  BookAuth.configured = true;

  /* -------------------------------------------------------------- dialog */
  let dlg = null;
  function dialog() {
    if (dlg) return dlg;
    dlg = document.createElement('div');
    dlg.className = 'auth-modal'; dlg.hidden = true;
    dlg.innerHTML = '<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">' +
      '<button class="auth-x" aria-label="Close" data-act="close">×</button><div class="auth-body"></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg || (e.target.dataset && e.target.dataset.act === 'close')) closeDialog(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlg.hidden) closeDialog(); });
    return dlg;
  }
  function closeDialog() { if (dlg) dlg.hidden = true; }
  function show(html, focusSel) {
    const d = dialog(); d.querySelector('.auth-body').innerHTML = html; d.hidden = false;
    const f = d.querySelector(focusSel || 'input'); if (f) f.focus();
    return d.querySelector('.auth-body');
  }
  function busy(form, on, text) {
    form.querySelectorAll('button, input').forEach(x => { x.disabled = on; });
    const s = form.querySelector('[type=submit]'); if (s && text) s.textContent = on ? 'Please wait…' : text;
  }
  function err(body, m) { const e = body.querySelector('.auth-err'); e.textContent = m || ''; e.hidden = !m; }

  const googleBtn = '<div class="auth-or"><span>or</span></div><button type="button" class="btn auth-wide" data-act="google">Continue with Google</button>';
  const note = '<p class="small muted auth-note">Your progress is stored under your account so you get it back on any device. <a href="' + (document.body.getAttribute('data-root') || './') + 'progress.html">Privacy details</a>.</p>';

  function viewSignIn(email) {
    const b = show('<h2 id="auth-title">Sign in</h2>' +
      '<p class="small muted">New here? <a href="#" data-act="to-signup">Create an account</a></p>' +
      '<form class="auth-form" novalidate>' +
      '<label>Email<input type="email" name="email" autocomplete="email" required value="' + esc(email) + '"></label>' +
      '<label>Password<input type="password" name="password" autocomplete="current-password" required></label>' +
      '<p class="auth-err" role="alert" hidden></p>' +
      '<button type="submit" class="btn primary auth-wide">Sign in</button>' +
      '<p class="small"><a href="#" data-act="to-reset">Forgot password?</a></p></form>' + googleBtn + note,
      email ? 'input[name=password]' : 'input[name=email]');
    const form = b.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault(); err(b, '');
      const em = form.email.value.trim(), pw = form.password.value;
      if (!em || !pw) { err(b, 'Please enter your email and password.'); return; }
      busy(form, true, 'Sign in');
      try { await A.signInWithEmailAndPassword(auth, em, pw); closeDialog(); }
      catch (x) { err(b, msgOf(x)); }
      finally { busy(form, false, 'Sign in'); }
    });
    wire(b, () => form.email.value.trim());
  }

  function viewSignUp(email) {
    const b = show('<h2 id="auth-title">Create an account</h2>' +
      '<p class="small muted">Already have one? <a href="#" data-act="to-signin">Sign in</a></p>' +
      '<form class="auth-form" novalidate>' +
      '<label>Name<input type="text" name="name" autocomplete="name" maxlength="60" placeholder="Shown in the header"></label>' +
      '<label>Email<input type="email" name="email" autocomplete="email" required value="' + esc(email) + '"></label>' +
      '<label>Password<input type="password" name="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></label>' +
      '<p class="auth-err" role="alert" hidden></p>' +
      '<button type="submit" class="btn primary auth-wide">Create account</button>' +
      '<p class="small muted">We will email you a link to confirm the address. Your progress starts syncing once you confirm.</p></form>' + googleBtn + note);
    const form = b.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault(); err(b, '');
      const name = form.name.value.trim(), em = form.email.value.trim(), pw = form.password.value;
      if (!em) { err(b, 'Please enter your email.'); return; }
      if (pw.length < 8) { err(b, MESSAGES['auth/weak-password']); return; }
      busy(form, true, 'Create account');
      try {
        const cred = await A.createUserWithEmailAndPassword(auth, em, pw);
        if (name) await A.updateProfile(cred.user, { displayName: name });
        await A.sendEmailVerification(cred.user, { url: returnUrl() });
        viewConfirm(cred.user);
        Book.renderAuth(cred.user, false); markPending(cred.user);
      } catch (x) { err(b, msgOf(x)); busy(form, false, 'Create account'); }
    });
    wire(b, () => form.email.value.trim());
  }

  function viewReset(email) {
    const b = show('<h2 id="auth-title">Reset your password</h2>' +
      '<form class="auth-form" novalidate>' +
      '<label>Email<input type="email" name="email" autocomplete="email" required value="' + esc(email) + '"></label>' +
      '<p class="auth-err" role="alert" hidden></p>' +
      '<button type="submit" class="btn primary auth-wide">Email me a reset link</button>' +
      '<p class="small"><a href="#" data-act="to-signin">Back to sign in</a></p></form>');
    const form = b.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault(); err(b, '');
      const em = form.email.value.trim(); if (!em) { err(b, 'Please enter your email.'); return; }
      busy(form, true, 'Email me a reset link');
      try {
        await A.sendPasswordResetEmail(auth, em, { url: returnUrl() });
        show('<h2 id="auth-title">Check your inbox</h2><p>If an account exists for <b>' + esc(em) + '</b>, a link to choose a new password is on its way. It can take a minute; check the spam folder too.</p>' +
          '<button class="btn primary auth-wide" data-act="to-signin">Back to sign in</button>', 'button');
        wire(dlg.querySelector('.auth-body'), () => em);
      } catch (x) { err(b, msgOf(x)); busy(form, false, 'Email me a reset link'); }
    });
    wire(b, () => form.email.value.trim());
  }

  function viewConfirm(user) {
    const b = show('<h2 id="auth-title">Confirm your email</h2>' +
      '<p>We sent a confirmation link to <b>' + esc(user.email) + '</b>. Open it (check the spam folder too), then come back and press the button below.</p>' +
      '<p class="auth-err" role="alert" hidden></p>' +
      '<button class="btn primary auth-wide" data-act="check">I have confirmed</button>' +
      '<p class="small"><a href="#" data-act="resend">Resend the email</a> · <a href="#" data-act="signout">Use a different account</a></p>' +
      '<p class="small muted">Until you confirm, your progress is still saved in this browser.</p>', 'button');
    b.querySelector('[data-act=check]').addEventListener('click', async () => {
      err(b, '');
      try {
        await A.reload(user);
        if (auth.currentUser && auth.currentUser.emailVerified) {
          await auth.currentUser.getIdToken(true);            // refresh the token so the rules see email_verified
          closeDialog(); startSync(auth.currentUser);
        } else err(b, 'Not confirmed yet. Open the link in the email first; it can take a minute to arrive.');
      } catch (x) { err(b, msgOf(x)); }
    });
    b.querySelector('[data-act=resend]').addEventListener('click', async e => {
      e.preventDefault();
      try { await A.sendEmailVerification(user, { url: returnUrl() }); Book.toast('Confirmation email sent again'); }
      catch (x) { err(b, msgOf(x)); }
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
        try { await A.signInWithPopup(auth, provider); closeDialog(); }
        catch (e) {
          if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) await A.signInWithRedirect(auth, provider);
          else { const er = b.querySelector('.auth-err'); if (er) { er.textContent = msgOf(e); er.hidden = false; } else Book.toast(msgOf(e)); }
        }
      });
    });
  }

  BookAuth.signIn = () => { const u = auth.currentUser; if (needsConfirm(u)) viewConfirm(u); else viewSignIn(''); };
  BookAuth.signOut = async () => { await A.signOut(auth); Book.toast('Signed out — progress stays in this browser.'); };

  /* -------------------------------------------------------------- sync */
  // This book shares a Firebase project (and the users/{uid} document) with other books in the
  // library, so its progress lives under its own field and every write merges.
  const NS = 'agenticAI';
  let pending = {}; let timer = null; let ready = false;
  function queue(ev) {
    if (!BookAuth.user || !ready) return;
    if (ev.kind === 'reload') { pushAll(); return; }
    const bucket = ev.kind === 'chapter' ? 'chapters' : 'items';
    pending[bucket] = pending[bucket] || {};
    pending[bucket][ev.id] = ev.rec === null ? F.deleteField() : ev.rec;
    clearTimeout(timer); timer = setTimeout(flush, 800);
  }
  async function flush() {
    const u = BookAuth.user; if (!u || !ready) return;
    const patch = pending; pending = {};
    if (!Object.keys(patch).length) return;
    try { await F.setDoc(F.doc(db, 'users', u.uid), { [NS]: patch, updatedAt: F.serverTimestamp() }, { merge: true }); }
    catch (e) { console.error('sync failed', e); Book.toast('Could not sync progress (offline?) — will retry on next change.'); }
  }
  async function pushAll() {
    const u = BookAuth.user; if (!u || !ready) return;
    const d = Book.store.data;
    try { await F.setDoc(F.doc(db, 'users', u.uid), { [NS]: { items: d.items, chapters: d.chapters }, updatedAt: F.serverTimestamp(), profile: { name: u.displayName || '', email: u.email || '' } }, { mergeFields: [NS, 'updatedAt', 'profile'] }); }
    catch (e) { console.error(e); }
  }
  Book.store.onChange(queue);

  function markPending(user) {
    const chip = document.querySelector('#auth-slot .user-chip'); if (!chip || chip.querySelector('.confirm-btn')) return;
    const btn = document.createElement('button'); btn.className = 'btn small confirm-btn'; btn.textContent = 'Confirm email';
    btn.addEventListener('click', () => viewConfirm(user));
    chip.insertBefore(btn, chip.querySelector('#signout-btn'));
    const note = document.getElementById('sync-note'); if (note) note.textContent = 'Confirm your email to start syncing';
  }

  async function startSync(user) {
    BookAuth.user = user; ready = false;
    Book.renderAuth(user, false);
    try {
      const snap = await F.getDoc(F.doc(db, 'users', user.uid));
      if (snap.exists() && snap.data()[NS]) Book.store.merge(snap.data()[NS]);
      ready = true;
      await pushAll();
      Book.renderAuth(user, true);
      const note = document.getElementById('sync-note'); if (note) note.textContent = 'Synced to your account';
      Book.toast('Progress synced with your account');
    } catch (e) { console.error(e); Book.toast('Signed in, but sync failed: ' + (e.code || e.message)); }
  }

  A.onAuthStateChanged(auth, user => {
    BookAuth.user = user; ready = false;
    if (!user) { Book.renderAuth(null); return; }
    if (needsConfirm(user)) { Book.renderAuth(user, false); markPending(user); return; }
    startSync(user);
  });
}

function rebindLocal(Book) {
  const b = document.getElementById('auth-btn');
  if (b) b.addEventListener('click', () => Book.toast('Accounts are not enabled yet. Your progress is saved in this browser; use My progress → Copy sync link to move it to another device.'));
}

main().catch(e => console.error(e));
