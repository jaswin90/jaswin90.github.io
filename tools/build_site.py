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

Apps are copied as they are (only the files listed in "include"). Apps and books share one account
system (assets/js/site-auth.js). The Firebase web config is written into the build from the
FIREBASE_CONFIG repository secret (JSON); no key is stored in any repository.

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
BOOKCSS = re.compile(r'(<link rel="stylesheet" href="[^"]*assets/css/book\.css">)')
THEME_KEYS = re.compile(r"\b(aai-theme|llmeng-theme)\b")   # each book's own dark-mode key -> the site's one key
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
    # One look for the whole site: the shared theme loads after the book's own stylesheet,
    # and visits are counted (analytics.js; page views only).
    if '/assets/css/theme.css' not in text:
        text = BOOKCSS.sub(lambda m: m.group(1) + '\n<link rel="stylesheet" href="/assets/css/theme.css">'
                           '\n<script type="module" src="/assets/js/analytics.js"></script>', text, count=1)
    return THEME_KEYS.sub('site-theme', text)


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
    for js in (out / 'assets' / 'js').glob('*.js'):
        t = js.read_text(); n = THEME_KEYS.sub('site-theme', t)
        if n != t:
            js.write_text(n)
    cfg = out / 'assets' / 'js' / 'firebase-config.js'
    if cfg.exists():
        cfg.write_text(FIREBASE_JS)
    if shimmed != pages:
        sys.exit('ERROR: %s: %d of %d pages could not load the library shim' % (book['slug'], pages - shimmed, pages))
    report.append('book %s/%s: %d pages%s' % (field['slug'], book['slug'], pages, note))


def firebase_config_js():
    """The site's Firebase web config, from the FIREBASE_CONFIG secret (JSON). Not stored in the repo."""
    raw = os.environ.get('FIREBASE_CONFIG', '').strip()
    cfg = {}
    if raw:
        cfg = json.loads(raw)
        missing = [k for k in ('apiKey', 'authDomain', 'projectId', 'appId') if not cfg.get(k)]
        if missing:
            sys.exit('ERROR: FIREBASE_CONFIG is missing ' + ', '.join(missing))
    else:
        print('WARNING: FIREBASE_CONFIG is not set: accounts are disabled in this build (progress stays in the browser).')
    global FIREBASE_CFG
    FIREBASE_CFG = dict(cfg)
    own = (SITE.get('auth') or {}).get('auth_domain')
    if cfg and own:
        cfg['authDomain'] = own   # sign-in window served from this site (see copy_auth_helper)
    return ('// Generated at build time from the FIREBASE_CONFIG repository secret. Do not commit.\n'
            'export const firebaseConfig = ' + json.dumps(cfg, indent=2) + ';\n')


def copy_auth_helper(report):
    """Copy Firebase's sign-in helper pages to /__/auth/ on this site.

    Some networks block firebaseapp.com, where Firebase normally serves the sign-in window.
    Firebase supports serving these files from your own domain instead ("host the sign-in helper
    code"). Pages without an extension are stored as <name>/index.html so GitHub Pages serves them
    as HTML (it redirects /__/auth/handler to /__/auth/handler/, keeping the query and fragment).
    """
    if not (SITE.get('auth') or {}).get('self_host_helper') or not FIREBASE_CFG.get('authDomain'):
        return
    base = 'https://%s/__/' % FIREBASE_CFG['authDomain']
    files = {'auth/handler': 'auth/handler/index.html', 'auth/handler.js': 'auth/handler.js',
             'auth/experiments.js': 'auth/experiments.js', 'auth/iframe': 'auth/iframe/index.html',
             'auth/iframe.js': 'auth/iframe.js', 'firebase/init.json': 'firebase/init.json'}
    got = 0
    for src, dst in files.items():
        try:
            body = urllib.request.urlopen(base + src, timeout=30).read()
        except Exception as e:
            print('note: could not fetch %s (%s); sign-in helper not self-hosted in this build' % (base + src, e))
            return
        d = OUT / '__' / dst; d.parent.mkdir(parents=True, exist_ok=True); d.write_bytes(body); got += 1
    report.append('sign-in helper: %d files at /__/' % got)


def build_app(app, tmp, report):
    src = fetch(app, tmp)
    out = OUT / 'apps' / app['slug']; out.mkdir(parents=True)
    for pat in app['include']:
        for s in glob.glob(str(src / pat)):
            s = pathlib.Path(s); d = out / s.name
            (shutil.copytree if s.is_dir() else shutil.copy2)(s, d)
    note = ''
    # One look for the whole site: the shared theme after the app's own stylesheet, and the
    # site's light/dark choice. (No analytics in apps: the Planner promises no tracking.)
    idx = out / 'index.html'
    if idx.exists():
        t = idx.read_text()
        if '/assets/css/theme.css' not in t:
            t2 = re.sub(r'(<link rel="stylesheet" href="css/[^"]+\.css">)', r'\1\n  <link rel="stylesheet" href="/assets/css/theme.css">'
                        r'\n  <script src="/assets/js/theme-init.js"></script>', t, count=1)
            if t2 != t:
                idx.write_text(t2); note = ' (site theme)'
    report.append('app %s: %d files%s' % (app['slug'], sum(1 for _ in out.rglob('*') if _.is_file()), note))


FIREBASE_CFG = {}
FIREBASE_JS = firebase_config_js()


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    (OUT / '.nojekyll').write_text('')
    shutil.copytree(ROOT / 'assets', OUT / 'assets')
    (OUT / 'assets' / 'js' / 'firebase-config.js').write_text(FIREBASE_JS)
    shutil.copy2(ROOT / 'tools' / 'gcp-setup.sh', OUT / 'setup.sh')   # one-time Cloud Shell setup (no secrets in it)
    shutil.copytree(ROOT / 'library' / 'assets', OUT / 'library' / 'assets')
    report = []
    with tempfile.TemporaryDirectory() as tmp:
        for field, book in books:
            build_book(field, book, tmp, report)
        for app in SITE.get('apps', []):
            build_app(app, tmp, report)
    copy_auth_helper(report)
    subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_pages.py')], check=True)
    print('\n'.join(report))


if __name__ == '__main__':
    main()
