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

## How it works
- This repository holds only sources: `site.json` (fields, books, apps), `tools/`, `assets/` (site styles and scripts) and `library/assets/` (the book shim). Nothing generated is committed.
- Each book and each app is developed in its own repository. `site.json` names the repository and the branch to publish from.
- `tools/build_site.py` builds everything into `_site/`: it fetches each book and adapts it to the library (pages load `library/assets/book-shim.js`, so the Sign in button goes to `/library/` while progress still syncs; links to the books' old addresses are routed to their library addresses; a progress write that would overwrite the shared account record is made to merge), fetches each app's listed files, writes the Firebase config from the `FIREBASE_CONFIG` secret into the site and every book, and runs `tools/build_pages.py` for the homepage, library, field and apps pages.
- `.github/workflows/deploy.yml` builds and publishes on every push to `main`, every three hours and on manual dispatch.
- **One account for the whole site, invite-only.** `assets/js/site-auth.js` (Firebase Auth, Google accounts only) is shared by the library, every book and every app; the session is shared across the site, so people sign in once, with the account button at the top right of the Library and Apps pages (`assets/js/account.js`; books send readers there to sign in). Only people on the invite list (Firestore `invites/<email>`) can use accounts; the admin (`k.jaswin@gmail.com`) adds and removes invites from that button's menu (Invites), and `firestore.rules` enforces the same rule on the server. Each book stores progress in its own field of `users/{uid}`. The Planner asks Google, through the same account, for its private Drive folder only (`drive.appdata`).
- **No keys in any repository.** The Firebase web config is written into the build from the `FIREBASE_CONFIG` secret. (Earlier commits still contain the old config in history; it is an identifier, not a password. Restrict it as described below.)

## One-time settings (done once for the whole site; nothing per user)
1. **GitHub, this repository** → Settings → Pages → Source: **GitHub Actions**.
2. **GitHub, this repository** → Settings → Secrets and variables → Actions → New repository secret `FIREBASE_CONFIG`, value: the web app config JSON from Firebase console → Project settings → Your apps (`{"apiKey": ..., "authDomain": ..., "projectId": ..., "storageBucket": ..., "messagingSenderId": ..., "appId": ...}`).
3. **Firebase console** (project `jaswin-s-library`) → Firestore Database → Rules: paste `firestore.rules`, Publish. → Authentication → Sign-in method: Google enabled; Settings → Authorized domains include `jaswin90.github.io`.
4. **Google Cloud console**, same project → APIs & Services → Library: enable **Google Drive API**. → Google Auth Platform → Data access: add the scope `.../auth/drive.appdata`. → Audience: **Publish app** (In production), so no test-user list is needed. Google may show an "unverified app" notice the first time someone connects Drive; that is expected for a personal app.
5. Optional: Google Cloud → Credentials → the Browser API key → Application restrictions: HTTP referrers `https://jaswin90.github.io/*`.

After that, adding a person is one entry in Invites (account menu, top right).

## Adding a book, a field or an app
- Book or field: add it to `site.json` under `fields` (`slug`, `title`, `blurb`, `repo`, `branch`, `src`, `progress_field`: the Firestore field its progress lives under, or `null` for top-level).
- App: add it to `site.json` under `apps` (`slug`, `title`, `blurb`, `repo`, `branch`, `include`: the files to publish).
- Push. No settings to change.

Local preview: `python3 tools/build_site.py && python3 -m http.server -d _site`.

## Rules for agents working here
- Never edit a book or an app in this repository: they are fetched at build time. Change them in their own repositories, or change the adaptation in `tools/build_site.py` / `library/assets/book-shim.js`.
- Sign-in UI lives only in the account button of the site pages (Library, fields, Apps). Book pages must not show a sign-in form; they link to `/library/?signin=1`.
- Before pushing, build `_site/`, serve it, and check every page at 1280 px and 390 px for page errors and horizontal overflow. Never commit `_site/`.
