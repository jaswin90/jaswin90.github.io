# jaswin90.github.io

Personal homepage and library, published by GitHub Pages at https://jaswin90.github.io/.

| Address | What it is |
|---|---|
| `/` | Homepage |
| `/library/` | The library: fields, and the **only** place to sign in, create an account or sign out |
| `/library/<Field>/` | A field, e.g. `/library/AI_Engineering/` |
| `/library/<Field>/<Book>/` | A book, e.g. `/library/AI_Engineering/Foundations-Agentic-AI/` |

## How it works
- Each book is written in its own repository (its site is in `docs/`). `library.json` lists fields and books with the repository and branch to publish from.
- `tools/sync_books.py` copies each book into `library/<Field>/<Book>/` and adapts it: pages load `library/assets/book-shim.js` (the Sign in button goes to the library; books still sync progress for a signed-in reader), absolute links to the books' old addresses are routed to their library addresses, and any progress write that would overwrite the shared account record is made to merge.
- `tools/build_pages.py` generates the homepage, `library/index.html` and the field pages from `library.json`.
- `.github/workflows/sync-books.yml` runs both every three hours, on manual dispatch and when the manifest or tools change, and commits the result; Pages publishes `main`.
- Accounts: one Firebase project (`jaswin-s-library`) for the whole library. Signing in at `/library/` signs the reader in for every book (same origin). Each book stores progress in its own field of `users/{uid}`.

## Adding a book or a field
1. Write the book in its own repository with the shared book machinery (`docs/` site).
2. Add it to `library.json` under its field (create the field if new): `slug`, `title`, `blurb`, `repo`, `branch`, `src`, and `progress_field` (the Firestore field its progress lives under, or `null` for top-level).
3. Push. The workflow syncs it and rebuilds the pages; no settings to change.

Local preview: `python3 tools/sync_books.py && python3 tools/build_pages.py && python3 -m http.server`.
