#!/usr/bin/env python3
"""Build the whole site into _site/ from site.json.

  _site/                      homepage            (tools/build_pages.py)
  _site/library/              library + sign-in   (tools/build_pages.py)
  _site/library/<Field>/      field pages         (tools/build_pages.py)
  _site/library/<Field>/<Book>/   each book, fetched from its own repository and adapted
  _site/apps/                 apps page           (tools/build_pages.py)
  _site/apps/<app>/           each app, fetched from its own repository

Books are adapted to the library: every page loads /library/assets/book-shim.js right after the
book's book.js (sign-in moves to /library/, progress still syncs), absolute links to the books' old
addresses are routed to their library addresses, and a progress write that would overwrite the shared
account record is made to merge.

Apps are copied as they are (only the files listed in "include"); an app that needs a public OAuth
client ID gets it from an environment variable (a repository secret in CI) or, failing that, from
the app's own current deployment.

Usage (repository root):  python3 tools/build_site.py [SLUG=/local/path ...]
"""
import glob, json, os, pathlib, re, shutil, subprocess, sys, tempfile, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / '_site'
SITE = json.loads((ROOT / 'site.json').read_text())
ORIGIN = 'https://jaswin90.github.io'
local = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)

books = [(f, b) for f in SITE['fields'] for b in f['books']]
url_map = {b['slug']: '/library/%s/%s/' % (f['slug'], b['slug']) for f, b in books}
url_map.update({a['slug']: '/apps/%s/' % a['slug'] for a in SITE.get('apps', [])})
BOOKJS = re.compile(r'(<script defer src="([^"]*?)assets/js/book\.js"></script>)')
OVERWRITE = re.compile(r"(profile: \{ name: u\.displayName \|\| '', email: u\.email \|\| '' \} \})\);")


def fetch(item, tmp):
    if item['slug'] in local:
        return pathlib.Path(local[item['slug']])
    dest = pathlib.Path(tmp) / item['slug']
    subprocess.run(['git', 'clone', '--quiet', '--depth', '1', '--branch', item['branch'],
                    'https://github.com/%s.git' % item['repo'], str(dest)], check=True)
    return dest


def adapt_book_html(text, field):
    if 'book-shim.js' not in text:
        text = BOOKJS.sub(lambda m: m.group(1) + '\n<script defer src="/library/assets/book-shim.js" data-library="/library/" '
                          'data-field="/library/%s/" data-field-title="%s"></script>' % (field['slug'], field['title']), text, count=1)
    for slug, url in url_map.items():
        text = re.sub(re.escape(ORIGIN + '/' + slug) + r'/?', url, text)
    return text


def build_book(field, book, tmp, report):
    src = fetch(book, tmp) / book.get('src', 'docs')
    out = OUT / 'library' / field['slug'] / book['slug']
    shutil.copytree(src, out, ignore=shutil.ignore_patterns('.nojekyll', 'CNAME'))
    pages = shimmed = 0
    for p in out.rglob('*.html'):
        t = p.read_text(); n = adapt_book_html(t, field)
        pages += 1; shimmed += 'book-shim.js' in n
        if n != t:
            p.write_text(n)
    note = ''
    auth = out / 'assets' / 'js' / 'auth.js'
    if auth.exists():
        t = auth.read_text()
        if OVERWRITE.search(t) and 'mergeFields' not in t:
            auth.write_text(OVERWRITE.sub(r"\1, { mergeFields: ['items', 'chapters', 'updatedAt', 'profile'] });", t))
            note = ' (sync write patched to merge)'
    if shimmed != pages:
        sys.exit('ERROR: %s: %d of %d pages could not load the library shim' % (book['slug'], pages - shimmed, pages))
    report.append('book %s/%s: %d pages%s' % (field['slug'], book['slug'], pages, note))


def client_id_for(app):
    cid = os.environ.get(app.get('client_id_secret', ''), '').strip()
    if cid:
        return cid, 'secret'
    url = app.get('client_id_fallback_url')
    if url:
        try:
            body = urllib.request.urlopen(url, timeout=20).read().decode()
            m = re.search(r"googleClientId: '([0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com)'", body)
            if m:
                return m.group(1), 'current deployment'
        except Exception as e:
            print('note: could not read %s (%s)' % (url, e))
    return '', ''


def build_app(app, tmp, report):
    src = fetch(app, tmp)
    out = OUT / 'apps' / app['slug']; out.mkdir(parents=True)
    for pat in app['include']:
        for s in glob.glob(str(src / pat)):
            s = pathlib.Path(s); d = out / s.name
            (shutil.copytree if s.is_dir() else shutil.copy2)(s, d)
    note = ''
    if app.get('client_id_file'):
        f = out / app['client_id_file']; t = f.read_text()
        cid, how = client_id_for(app)
        if cid and "googleClientId: ''" in t:
            f.write_text(t.replace("googleClientId: ''", "googleClientId: '%s'" % cid)); note = ' (client ID from %s)' % how
        elif not cid:
            note = ' (WARNING: no client ID; Google sign-in disabled)'
    report.append('app %s: %d files%s' % (app['slug'], sum(1 for _ in out.rglob('*') if _.is_file()), note))


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    (OUT / '.nojekyll').write_text('')
    shutil.copytree(ROOT / 'assets', OUT / 'assets')
    shutil.copytree(ROOT / 'library' / 'assets', OUT / 'library' / 'assets')
    report = []
    with tempfile.TemporaryDirectory() as tmp:
        for field, book in books:
            build_book(field, book, tmp, report)
        for app in SITE.get('apps', []):
            build_app(app, tmp, report)
    subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_pages.py')], check=True)
    print('\n'.join(report))


if __name__ == '__main__':
    main()
