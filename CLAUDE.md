# CLAUDE.md — the homepage, library and apps site

Personal homepage, library and apps, published by GitHub Pages at https://jaswin90.github.io/.

| Address | What it is |
|---|---|
| `/` | Homepage |
| `/library/` | The library: fields and your progress |
| `/library/<Field>/` | A field, e.g. `/library/AI_Engineering/` |
| `/library/<Field>/<Book>/` | A book, e.g. `/library/AI_Engineering/Foundations-Agentic-AI/` |
| `/apps/` | Apps |
| `/apps/<App>/` | An app, e.g. `/apps/planner/` |
| `/admin/` | Admin only (tab appears for `k.jaswin@gmail.com`): visitor dashboard and invites |

## How it works
- This repository holds only sources: `site.json` (fields, books, apps), `tools/`, `assets/` (site styles and scripts) and `library/assets/` (the book shim). Nothing generated is committed.
- Each book and each app is developed in its own repository. `site.json` names the repository and the branch to publish from.
- `tools/build_site.py` builds everything into `_site/`: it fetches each book and adapts it to the library (pages load `library/assets/book-shim.js`, so the Sign in button goes to `/library/` while progress still syncs; links to the books' old addresses are routed to their library addresses; a progress write that would overwrite the shared account record is made to merge), fetches each app's listed files, writes the Firebase config from the `FIREBASE_CONFIG` secret into the site and every book, and runs `tools/build_pages.py` for the homepage, library, field and apps pages.
- `.github/workflows/deploy.yml` builds and publishes on every push to `main`, every three hours and on manual dispatch.
- **One account for the whole site, invite-only.** `assets/js/site-auth.js` (Firebase Auth, Google accounts only) is shared by the library, every book and every app; the session is shared across the site, so people sign in once, with the account button at the top right of the Library and Apps pages (`assets/js/account.js`; books send readers there to sign in). Only people on the invite list (Firestore `invites/<email>`) can use accounts; the admin (`k.jaswin@gmail.com`) adds and removes invites on the Admin page, and `firestore.rules` enforces the same rule on the server. Each book stores progress in its own field of `users/{uid}`. The Planner stores each person's data, encrypted in the browser, in Firestore under `planner/{uid}/` (only that person can read or write it); no Google Drive.
- **One look.** `assets/css/theme.css` (colours, fonts, light/dark) is loaded by the site pages, by every book (after its own stylesheet) and by every app; the dark-mode choice is one key, `site-theme`, for the whole site.
- **Visitor analytics.** `assets/js/analytics.js` sends page views to Google Analytics 4 (the GA4 property linked to the Firebase project; measurement ID from `FIREBASE_CONFIG.measurementId`) from the site pages and every book; not from the Planner, which promises no tracking. It respects Do Not Track. The Admin page reads the numbers with the Google Analytics Data API using the admin's own Google sign-in (`analytics.readonly`).
- **Sign-in window served from this site.** Some networks (e.g. a workplace proxy) block `jaswin-s-library.firebaseapp.com`, where Firebase normally opens the Google sign-in window. The build copies Firebase's sign-in helper to `/__/auth/` and `/__/firebase/init.json` (`copy_auth_helper` in `tools/build_site.py`), and `site.json` → `auth.auth_domain` = `jaswin90.github.io` makes sign-in use it. This needs, on the OAuth client "Web client (auto created by Google Service)" (no API; set once in the console): origin `https://jaswin90.github.io` and redirect URIs `https://jaswin90.github.io/__/auth/handler` and `.../handler/`. Set `auth_domain` to `null` to go back to Firebase's own domain.
- **No keys in any repository.** The Firebase web config is written into the build from the `FIREBASE_CONFIG` secret. (Earlier commits still contain the old config in history; it is an identifier, not a password. Restrict it as described below.)

## One-time settings (done once for the whole site; nothing per user)
1. **GitHub, this repository** → Settings → Pages → Source: **GitHub Actions**.
2. **GitHub, this repository** → Settings → Secrets and variables → Actions → New repository secret `FIREBASE_CONFIG`, value: the web app config JSON from Firebase console → Project settings → Your apps (`{"apiKey": ..., "authDomain": ..., "projectId": ..., "storageBucket": ..., "messagingSenderId": ..., "appId": ...}`).
3. **Firebase console** (project `jaswin-s-library`) → Firestore Database → Rules: paste `firestore.rules`, Publish. → Authentication → Sign-in method: Google enabled; Settings → Authorized domains include `jaswin90.github.io`.
4. **Google Cloud console**, same project → APIs & Services → Library: enable **Google Drive API**. → Google Auth Platform → Data access: add the scope `.../auth/drive.appdata`. → Audience: **Publish app** (In production), so no test-user list is needed. Google may show an "unverified app" notice the first time someone connects Drive; that is expected for a personal app.
5. **Visitor dashboard:** Firebase console → Project settings → Integrations → Google Analytics → Enable; copy the web app config again (it now has `measurementId`) into the `FIREBASE_CONFIG` secret; Google Cloud → enable **Google Analytics Data API** and **Google Analytics Admin API**; Google Auth Platform → Data access → add `analytics.readonly`.
6. Optional: Google Cloud → Credentials → the Browser API key → Application restrictions: Websites, with **both** `https://jaswin90.github.io/*` and `https://jaswin-s-library.firebaseapp.com/*` (Firebase's sign-in window runs on the second; without it sign-in fails with "The requested action is invalid"). If you also restrict APIs, keep Identity Toolkit API, Token Service API, Cloud Firestore API and Firebase Installations API allowed.

After that, adding a person is one entry under Invites on the Admin page.

## Automation (no console visits)
`.github/workflows/google-setup.yml` applies the Google/Firebase side from this repository: it enables the APIs, restricts the browser API key (site + Firebase sign-in domain) and publishes `firestore.rules`. It runs on manual dispatch and whenever the rules change. It signs in to Google with no stored key (Workload Identity Federation) as the service account `site-automation` (roles Firebase Admin, Service Usage Admin, API Keys Admin), usable only by this repository's workflows. Set up once by typing `curl -sL jaswin90.github.io/setup.sh | bash` in Google Cloud Shell (script: `tools/gcp-setup.sh`). (Two settings have no public API and stay manual, done once already: publishing the OAuth consent screen and linking Google Analytics.)

## Adding a book, a field or an app
- Book or field: add it to `site.json` under `fields` (`slug`, `title`, `blurb`, `repo`, `branch`, `src`, `progress_field`: the Firestore field its progress lives under, or `null` for top-level).
- A second volume published inside another book's site: add an entry with `within` (the parent book's slug) and `path` (e.g. `cloud/`) instead of `repo`/`branch`/`src`; it is listed as its own book but not built separately. Give both entries a `progress_prefix` (the prefix of their question ids, e.g. `ch` and `ci`) so progress is counted per volume.
- App: add it to `site.json` under `apps` (`slug`, `title`, `blurb`, `repo`, `branch`, `include`: the files to publish).
- Push. No settings to change.

Local preview: `python3 tools/build_site.py && python3 -m http.server -d _site`.

## Rules for agents working here
- Never edit a book or an app in this repository: they are fetched at build time. Change them in their own repositories, or change the adaptation in `tools/build_site.py` / `library/assets/book-shim.js`.
- Sign-in UI lives only in the account button of the site pages (Library, fields, Apps). Book pages must not show a sign-in form; they link to `/library/?signin=1`.
- Before pushing, build `_site/`, serve it, and check every page at 1280 px and 390 px for page errors and horizontal overflow. Never commit `_site/`.
