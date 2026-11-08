// One account for the whole site (library books and apps), invite-only.
//
// - Firebase Auth (Google or email + password). The session is shared by every page of
//   jaswin90.github.io, so signing in once at /library/ signs the reader in everywhere.
// - Invite-only: a signed-in person may use accounts only if invites/<their email> exists in
//   Firestore. The admin adds and removes invites from the library page; Firestore security
//   rules (firestore.rules) enforce the same check on the server.
// - firebase-config.js is generated at build time from the FIREBASE_CONFIG repository secret;
//   it is not stored in the repository.
import { firebaseConfig } from './firebase-config.js';

export const ADMIN_EMAIL = 'k.jaswin@gmail.com';
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
let ctx = null;

export const configured = () => !!(firebaseConfig && firebaseConfig.apiKey);
export const norm = (e) => String(e || '').trim().toLowerCase();
export const isPasswordUser = (u) => !!u && (u.providerData || []).some((p) => p.providerId === 'password');
export const needsConfirm = (u) => !!u && isPasswordUser(u) && !u.emailVerified;

/** Load Firebase once per page. Returns { A, F, auth, db }. */
export async function firebase() {
  if (ctx) return ctx;
  if (!configured()) throw new Error('Accounts are not configured on this site build.');
  const [{ initializeApp, getApps }, A, F] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
  ]);
  const app = getApps()[0] || initializeApp(firebaseConfig);
  ctx = { A, F, app, auth: A.getAuth(app), db: F.getFirestore(app) };
  return ctx;
}

/** Is this user allowed in? Admin always is; others need invites/<email>. */
export async function isInvited(user) {
  if (!user || needsConfirm(user)) return false;
  const email = norm(user.email);
  if (email === ADMIN_EMAIL) return true;
  const { F, db } = await firebase();
  try { return (await F.getDoc(F.doc(db, 'invites', email))).exists(); }
  catch (e) { return false; }   // the rules deny reading anything but your own invite
}

/** Call cb({ user, invited, admin }) now and on every sign-in change. */
export async function onSession(cb) {
  const { A, auth } = await firebase();
  return A.onAuthStateChanged(auth, async (user) => {
    const invited = await isInvited(user);
    cb({ user, invited, admin: !!user && invited && norm(user.email) === ADMIN_EMAIL });
  });
}

/** Library sign-in URL that returns to the current page afterwards. */
export function signInUrl(next = location.pathname + location.search + location.hash) {
  return '/library/?signin=1&next=' + encodeURIComponent(next);
}

/** Invite management (admin only; enforced by the rules). */
export async function listInvites() {
  const { F, db } = await firebase();
  const snap = await F.getDocs(F.collection(db, 'invites'));
  return snap.docs.map((d) => ({ email: d.id, ...d.data() })).sort((a, b) => a.email.localeCompare(b.email));
}
export async function addInvite(email, note = '') {
  const { F, db, auth } = await firebase();
  const e = norm(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('That does not look like an email address.');
  await F.setDoc(F.doc(db, 'invites', e), { note: String(note).slice(0, 200), invitedBy: auth.currentUser.email, at: F.serverTimestamp() });
  return e;
}
export async function removeInvite(email) {
  const { F, db } = await firebase();
  await F.deleteDoc(F.doc(db, 'invites', norm(email)));
}
