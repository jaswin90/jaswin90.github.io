#!/usr/bin/env python3
"""Copy every book listed in library.json into library/<field>/<book>/ and adapt it to the library.

Each book is written in its own repository; this script fetches the book's site folder from the
configured branch and applies three transformations:
  1. every page loads /library/assets/book-shim.js right after the book's book.js, which moves the
     sign-in UI to the library (books still sync progress for a reader signed in at the library);
  2. absolute links to the books' old addresses (https://jaswin90.github.io/<book>/...) are routed
     to their library addresses, so every hyperlink stays inside /library/;
  3. a progress-sync write that would overwrite the shared user record is made to merge
     (needed because all books share one account record).

Usage (repository root):  python3 tools/sync_books.py [--local SLUG=/path/to/docs ...]
"""
import json, pathlib, re, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIB = json.loads((ROOT / 'library.json').read_text())
SITE = 'https://jaswin90.github.io'

local = {}
for a in sys.argv[1:]:
    if a.startswith('--local'):
        continue
    if '=' in a:
        k, v = a.split('=', 1); local[k] = pathlib.Path(v)

books = [(f, b) for f in LIB['fields'] for b in f['books']]
url_map = {b['slug']: '/library/%s/%s/' % (f['slug'], b['slug']) for f, b in books}
BOOKJS = re.compile(r'(<script defer src="([^"]*?)assets/js/book\.js"></script>)')
MERGE_FIX = (re.compile(r"(profile: \{ name: u\.displayName \|\| '', email: u\.email \|\| '' \} \})\);"),
             r"\1, { mergeFields: ['items', 'chapters', 'updatedAt', 'profile'] });")


def fetch(book, tmp):
    if book['slug'] in local:
        return local[book['slug']]
    dest = pathlib.Path(tmp) / book['slug']
    subprocess.run(['git', 'clone', '--quiet', '--depth', '1', '--branch', book['branch'],
                    'https://github.com/%s.git' % book['repo'], str(dest)], check=True)
    return dest / book.get('src', 'docs')


def adapt_html(text, field, book):
    def shim(m):
        return (m.group(1) + '\n<script defer src="/library/assets/book-shim.js" data-library="/library/" '
                'data-field="/library/%s/" data-field-title="%s"></script>' % (field['slug'], field['title']))
    if 'book-shim.js' not in text:
        text = BOOKJS.sub(shim, text, count=1)
    for slug, url in url_map.items():
        text = re.sub(re.escape(SITE + '/' + slug) + r'/?', url, text)
    return text


def main():
    report = []
    with tempfile.TemporaryDirectory() as tmp:
        for field, book in books:
            src = fetch(book, tmp)
            out = ROOT / 'library' / field['slug'] / book['slug']
            if out.exists():
                shutil.rmtree(out)
            shutil.copytree(src, out, ignore=shutil.ignore_patterns('.nojekyll', 'CNAME'))
            pages = shimmed = 0
            for p in out.rglob('*.html'):
                t = p.read_text(); n = adapt_html(t, field, book)
                pages += 1; shimmed += 'book-shim.js' in n
                if n != t:
                    p.write_text(n)
            auth = out / 'assets' / 'js' / 'auth.js'
            fixed = ''
            if auth.exists():
                t = auth.read_text()
                if re.search(r"setDoc\([^;]*profile:[^;]*\}\);", t) and 'mergeFields' not in t:
                    t2 = MERGE_FIX[0].sub(MERGE_FIX[1], t)
                    if t2 == t:
                        sys.exit('ERROR: %s auth.js overwrites the shared record and could not be patched' % book['slug'])
                    auth.write_text(t2); fixed = ' (sync write patched to merge)'
            report.append('%s/%s: %d pages, %d with library shim%s' % (field['slug'], book['slug'], pages, shimmed, fixed))
    print('\n'.join(report))


if __name__ == '__main__':
    main()
