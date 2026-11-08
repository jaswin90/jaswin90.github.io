# jaswin90.github.io

Personal homepage, library and apps, published by GitHub Pages at https://jaswin90.github.io/.

| Address | What it is |
|---|---|
| `/` | Homepage |
| `/library/` | The library: fields, and the **only** place to sign in, create an account or sign out |
| `/library/<Field>/` | A field, e.g. `/library/AI_Engineering/` |
| `/library/<Field>/<Book>/` | A book, e.g. `/library/AI_Engineering/Foundations-Agentic-AI/` |
| `/apps/` | Apps |
| `/apps/<App>/` | An app, e.g. `/apps/planner/` |

## How it works
- This repository holds only sources: `site.json` (fields, books, apps), `tools/`, `assets/` (site styles and scripts) and `library/assets/` (library sign-in and the book shim). Nothing generated is committed.
- Each book and each app is developed in its own repository. `site.json` names the repository and the branch to publish from.
- `tools/build_site.py` builds everything into `_site/`: it fetches each book and adapts it to the library (pages load `library/assets/book-shim.js`, so the Sign in button goes to `/library/` while progress still syncs; links to the books' old addresses are routed to their library addresses; a progress write that would overwrite the shared account record is made to merge), fetches each app's listed files, inserts an app's public Google client ID (from the `GOOGLE_CLIENT_ID` repository secret, or else from the app's current deployment), and runs `tools/build_pages.py` for the homepage, library, field and apps pages.
- `.github/workflows/deploy.yml` builds and publishes on every push to `main`, every three hours and on manual dispatch.
- Book accounts: one Firebase project (`jaswin-s-library`) for the whole library. Signing in at `/library/` signs the reader in for every book (same origin); each book stores progress in its own field of `users/{uid}`. Apps keep their own sign-in (the Planner uses Google sign-in and the reader's own Google Drive).

## One-time settings
- Settings → Pages → Source: **GitHub Actions**.
- Settings → Secrets and variables → Actions: `GOOGLE_CLIENT_ID` (the Planner's OAuth client ID; optional while the Planner's own deployment is live, since the build can read it from there). The client ID's authorised JavaScript origin `https://jaswin90.github.io` already covers `/apps/planner/`.

## Adding a book, a field or an app
- Book or field: add it to `site.json` under `fields` (`slug`, `title`, `blurb`, `repo`, `branch`, `src`, `progress_field`: the Firestore field its progress lives under, or `null` for top-level).
- App: add it to `site.json` under `apps` (`slug`, `title`, `blurb`, `repo`, `branch`, `include`: the files to publish).
- Push. No settings to change.

Local preview: `python3 tools/build_site.py && python3 -m http.server -d _site`.
