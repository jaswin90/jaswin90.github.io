#!/usr/bin/env python3
"""Generate the homepage, the library page, one page per field and the apps page into _site/ from site.json.

Called by tools/build_site.py. Hand-edit only site.json and the HOME_* text below.
"""
import json, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIB = json.loads((ROOT / 'site.json').read_text())
APPS = LIB.get('apps', [])
OUT = ROOT / '_site'

SITE_NAME = 'Jaswin'
HOME_TAGLINE = 'Mathematics, machine learning and the engineering of AI systems.'
HOME_ABOUT = ('Welcome. This is my personal site. The library collects the books I write: free, interactive '
              'textbooks with derivations, diagrams, exercises and interview questions.')

e = html.escape


def page(title, desc, body, depth_root, extra_head='', active='', account=True):
    nav = ''.join('<a href="%s"%s>%s</a>' % (href, ' aria-current="page"' if key == active else '', label)
                  for key, href, label in [('home', '/', 'Home'), ('library', '/library/', 'Library'), ('apps', '/apps/', 'Apps')])
    account_slot = ('<span id="account-slot"></span>\n<script type="module" src="/assets/js/account.js"></script>\n') if account else ''
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
{account_slot}</header>
<main class="site">
{body}
</main>
<footer class="site-foot small muted">© {e(SITE_NAME)} · <a href="https://github.com/jaswin90">GitHub</a></footer>
</body>
</html>
'''


def write(rel, text):
    p = OUT / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text)


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
</section>
<section>
<h2>Apps</h2>
<div class="cards">''' + ''.join(
    f'<a class="card" href="/apps/{e(a["slug"])}/"><h3>{e(a["title"])}</h3><p>{e(a["blurb"])}</p></a>' for a in APPS) + '''</div>
<p><a href="/apps/">All apps →</a></p>
</section>'''
write('index.html', page(SITE_NAME, HOME_TAGLINE, home, '/', active='home', account=False))

# ---------------------------------------------------------------- library
books_json = json.dumps([{'title': b['title'], 'url': book_url(f, b), 'progress_field': b.get('progress_field')}
                         for f in LIB['fields'] for b in f['books']])
lib = '''<section class="hero">
<h1>Library</h1>
</section>
''' + ''.join(
    f'<section class="plain shelf"><h2><a href="/library/{e(f["slug"])}/">{e(f["title"])}</a></h2><ul class="book-links">'
    + ''.join(f'<li><a href="{book_url(f, b)}">{e(b["title"])}</a></li>' for b in f['books']) + '</ul></section>'
    for f in LIB['fields']) + '''
<script type="application/json" id="library-books">''' + books_json.replace('</', '<\\/') + '''</script>
<section id="progress-section" hidden>
<h2>Your progress</h2>
<div id="progress"><p class="small muted">Loading…</p></div>
</section>'''
write('library/index.html', page('Library — ' + SITE_NAME, 'Free, interactive textbooks by field.', lib, '/', active='library'))

# ---------------------------------------------------------------- fields
for f in LIB['fields']:
    body = f'''<p class="crumbs small"><a href="/library/">Library</a> › {e(f["title"])}</p>
<section class="hero">
<h1>{e(f["title"])}</h1>
</section>
<section class="plain shelf">
<ul class="book-links">''' + ''.join(
        f'<li><a href="{book_url(f, b)}">{e(b["title"])}</a></li>'
        for b in f['books']) + '''</ul>
</section>'''
    write('library/%s/index.html' % f['slug'], page(f['title'] + ' — Library', f['blurb'], body, '/', active='library'))
apps = '''<section class="hero">
<h1>Apps</h1>
<p class="sub">Small tools that run in your browser. Each app has its own sign-in where it needs one.</p>
</section>
<section>
<div class="cards">''' + ''.join(
    f'<a class="card" href="/apps/{e(a["slug"])}/"><h3>{e(a["title"])}</h3><p>{e(a["blurb"])}</p><p class="small muted">Open →</p></a>' for a in APPS) + '''</div>
</section>'''
write('apps/index.html', page('Apps — ' + SITE_NAME, 'Small browser apps.', apps, '/', active='apps'))
print('pages built:', 3 + len(LIB['fields']))
