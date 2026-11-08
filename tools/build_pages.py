#!/usr/bin/env python3
"""Generate the homepage, the library page and one page per field from library.json.

Run from the repository root:  python3 tools/build_pages.py
Hand-edit only library.json (fields and books) and the HOME_* text below.
"""
import json, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIB = json.loads((ROOT / 'library.json').read_text())

SITE_NAME = 'Jaswin'
HOME_TAGLINE = 'Mathematics, machine learning and the engineering of AI systems.'
HOME_ABOUT = ('Welcome. This is my personal site. The library collects the books I write: free, interactive '
              'textbooks with derivations, diagrams, exercises and interview questions.')

e = html.escape


def page(title, desc, body, depth_root, extra_head='', active=''):
    nav = ''.join('<a href="%s"%s>%s</a>' % (href, ' aria-current="page"' if key == active else '', label)
                  for key, href, label in [('home', '/', 'Home'), ('library', '/library/', 'Library')])
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<script>try{{var t=localStorage.getItem('site-theme');if(t)document.documentElement.setAttribute('data-theme',t)}}catch(e){{}}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="/assets/css/home.css">
<script defer src="/assets/js/site.js"></script>
{extra_head}</head>
<body>
<header class="topbar">
<a class="brand" href="/">{e(SITE_NAME)}</a>
<span class="spacer"></span>
<nav>{nav}</nav>
<button class="btn icon-btn" id="theme-btn" aria-label="Toggle dark mode" title="Toggle dark mode">◐</button>
</header>
<main class="site">
{body}
</main>
<footer class="site-foot small muted">© {e(SITE_NAME)} · <a href="https://github.com/jaswin90">GitHub</a></footer>
</body>
</html>
'''


def write(rel, text):
    p = ROOT / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text)


def book_url(field, book):
    return '/library/%s/%s/' % (field['slug'], book['slug'])


# ---------------------------------------------------------------- homepage
home = f'''<section class="hero">
<h1>{e(SITE_NAME)}</h1>
<p class="sub">{e(HOME_TAGLINE)}</p>
<p>{e(HOME_ABOUT)}</p>
<p><a class="btn primary" href="/library/">Open the library →</a></p>
</section>
<section>
<h2>In the library</h2>
<div class="cards">''' + ''.join(
    f'<a class="card" href="/library/{e(f["slug"])}/"><h3>{e(f["title"])}</h3><p>{e(f["blurb"])}</p>'
    f'<p class="small muted">{len(f["books"])} book{"s" if len(f["books"]) != 1 else ""}</p></a>'
    for f in LIB['fields']) + '''</div>
</section>'''
write('index.html', page(SITE_NAME, HOME_TAGLINE, home, '/', active='home'))

# ---------------------------------------------------------------- library
books_json = json.dumps([{'title': b['title'], 'url': book_url(f, b), 'progress_field': b.get('progress_field')}
                         for f in LIB['fields'] for b in f['books']])
lib = '''<section class="hero">
<div class="chapter-kicker">Library</div>
<h1>The library</h1>
<p class="sub">Free, interactive textbooks, grouped by field.</p>
</section>
<section class="account">
<h2>Your account</h2>
<div id="account"><p class="small muted">Loading…</p></div>
</section>
<section>
<h2>Fields</h2>
<div class="cards">''' + ''.join(
    f'<a class="card" href="/library/{e(f["slug"])}/"><h3>{e(f["title"])}</h3><p>{e(f["blurb"])}</p>'
    f'<p class="small muted">' + ' · '.join(e(b['title']) for b in f['books']) + '</p></a>'
    for f in LIB['fields']) + '''</div>
</section>
<script type="application/json" id="library-books">''' + books_json.replace('</', '<\\/') + '''</script>
<script type="module" src="/library/assets/library-auth.js"></script>'''
write('library/index.html', page('Library — ' + SITE_NAME, 'Free, interactive textbooks by field.', lib, '/', active='library'))

# ---------------------------------------------------------------- fields
for f in LIB['fields']:
    body = f'''<p class="crumbs small"><a href="/library/">Library</a> › {e(f["title"])}</p>
<section class="hero">
<div class="chapter-kicker">Field</div>
<h1>{e(f["title"])}</h1>
<p class="sub">{e(f["blurb"])}</p>
</section>
<section>
<div class="cards">''' + ''.join(
        f'<a class="card" href="{book_url(f, b)}"><h3>{e(b["title"])}</h3><p>{e(b["blurb"])}</p><p class="small muted">Read online →</p></a>'
        for b in f['books']) + '''</div>
<p class="small muted">To keep your progress across devices, sign in once at the <a href="/library/">library</a>; every book syncs automatically.</p>
</section>'''
    write('library/%s/index.html' % f['slug'], page(f['title'] + ' — Library', f['blurb'], body, '/', active='library'))
print('pages built:', 2 + len(LIB['fields']))
