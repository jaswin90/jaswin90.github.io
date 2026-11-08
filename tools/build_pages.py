#!/usr/bin/env python3
"""Generate the site's own pages into _site/ from site.json: homepage, library, field pages,
apps page and the admin page. Called by tools/build_site.py.

Pages are deliberately plain (titles and links, no descriptions) until the personal homepage
is designed.
"""
import json, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = json.loads((ROOT / 'site.json').read_text())
FIELDS = SITE['fields']
APPS = SITE.get('apps', [])
OUT = ROOT / '_site'
SITE_NAME = 'Jaswin'
e = html.escape

NAV = [('home', '/', 'Home'), ('library', '/library/', 'Library'), ('apps', '/apps/', 'Apps')]


def page(title, body, active='', account=True, scripts=''):
    nav = ''.join('<a href="%s"%s>%s</a>' % (href, ' aria-current="page"' if key == active else '', label)
                  for key, href, label in NAV)
    # The Admin link is added to the nav by account.js, for the admin only.
    nav += '<a href="/admin/" class="admin-link" hidden%s>Admin</a>' % (' aria-current="page"' if active == 'admin' else '')
    account_slot = ('<span id="account-slot"></span>\n<script type="module" src="/assets/js/account.js"></script>\n') if account else ''
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<script src="/assets/js/theme-init.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="/assets/css/theme.css">
<link rel="stylesheet" href="/assets/css/home.css">
<script defer src="/assets/js/site.js"></script>
<script type="module" src="/assets/js/analytics.js"></script>
{scripts}</head>
<body>
<header class="topbar">
<a class="brand" href="/">{e(SITE_NAME)}</a>
<span class="spacer"></span>
<nav>{nav}</nav>
<button class="btn icon-btn" id="theme-btn" aria-label="Toggle dark mode" title="Toggle dark mode">◐</button>
{account_slot}</header>
<main class="site">
{body}
</main>
</body>
</html>
'''


def write(rel, text):
    p = OUT / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text)


def book_url(field, book):
    return '/library/%s/%s/' % (field['slug'], book['slug'])


def links(items):
    return '<ul class="book-links">' + ''.join('<li><a href="%s">%s</a></li>' % (u, e(t)) for u, t in items) + '</ul>'


# homepage: name and the two sections, nothing else for now
write('index.html', page(SITE_NAME, f'''<section class="hero"><h1>{e(SITE_NAME)}</h1></section>
<section class="plain shelf">{links([('/library/', 'Library'), ('/apps/', 'Apps')])}</section>''', active='home', account=False))

# library: each field, then its books
books_json = json.dumps([{'title': b['title'], 'url': book_url(f, b), 'progress_field': b.get('progress_field')}
                         for f in FIELDS for b in f['books']])
lib = '<section class="hero"><h1>Library</h1></section>\n' + ''.join(
    f'<section class="plain shelf"><h2><a href="/library/{e(f["slug"])}/">{e(f["title"])}</a></h2>'
    + links([(book_url(f, b), b['title']) for b in f['books']]) + '</section>\n' for f in FIELDS) + \
    '<script type="application/json" id="library-books">' + books_json.replace('</', '<\\/') + '</script>\n' + \
    '<section id="progress-section" hidden><h2>Your progress</h2><div id="progress"></div></section>'
write('library/index.html', page('Library — ' + SITE_NAME, lib, active='library'))

for f in FIELDS:
    write('library/%s/index.html' % f['slug'], page(f['title'] + ' — Library', f'''<p class="crumbs small"><a href="/library/">Library</a> › {e(f["title"])}</p>
<section class="hero"><h1>{e(f["title"])}</h1></section>
<section class="plain shelf">{links([(book_url(f, b), b['title']) for b in f['books']])}</section>''', active='library'))

write('apps/index.html', page('Apps — ' + SITE_NAME, '<section class="hero"><h1>Apps</h1></section>\n'
                          f'<section class="plain shelf">{links([("/apps/%s/" % a["slug"], a["title"]) for a in APPS])}</section>', active='apps'))

# admin: invites and the visitor dashboard; admin.js shows nothing to anyone else
write('admin/index.html', page('Admin — ' + SITE_NAME, '''<section class="hero"><h1>Admin</h1></section>
<div id="admin"><p class="small muted">Checking your account…</p></div>''', active='admin',
                               scripts='<meta name="robots" content="noindex">\n<script type="module" src="/assets/js/admin.js"></script>\n'))
print('pages built:', 4 + len(FIELDS))
