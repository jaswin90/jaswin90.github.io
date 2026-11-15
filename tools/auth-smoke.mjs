// Sign-in smoke test, run by .github/workflows/auth-check.yml after every deploy.
//
// It cannot finish a Google sign-in (that needs a real account), but it checks every step
// that a site change can break, in desktop Chromium, desktop Firefox and a phone (WebKit):
//   1. the Library page loads the account button without page errors;
//   2. "Continue with Google" opens the sign-in window (popup, or this tab on phones);
//   3. that window reaches accounts.google.com, not a blank or error page, and Google
//      does not reject the request (redirect_uri_mismatch, invalid_request, ...);
//   4. the address Google will send the reader back to is served by this site as a working
//      page (the self-hosted helper at /__/auth/handler).
// Exit code 1 if any check fails, with screenshots in auth-smoke/.
import { chromium, firefox, webkit, devices } from 'playwright';
import fs from 'node:fs';

const SITE = process.env.SITE || 'https://jaswin90.github.io';
const OUT = 'auth-smoke';
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const fail = (who, msg) => { failures.push(`${who}: ${msg}`); console.log(`  FAIL ${msg}`); };

async function run(name, browserType, ctxOpts) {
  console.log(`\n== ${name}`);
  const browser = await browserType.launch();
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(SITE + '/library/?signin=1', { waitUntil: 'networkidle', timeout: 60000 });
    const btn = page.locator('[data-act=google]');
    await btn.waitFor({ timeout: 30000 });
    const popupP = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null);
    await btn.click();
    let win = await popupP;
    const how = win ? 'popup' : 'same tab';
    win = win || page;
    const chain = [];
    win.on('framenavigated', (f) => { if (f === win.mainFrame()) chain.push(f.url()); });
    await win.waitForURL(/accounts\.google\.com/, { timeout: 30000 }).catch(() => {});
    await win.waitForLoadState('domcontentloaded').catch(() => {});
    await win.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
    const url = win.url();
    console.log(`  sign-in window opened as: ${how}`);
    for (const u of chain) console.log('  visited:', u.split('?')[0]);
    console.log('  now at :', url.split('?')[0]);
    if (!/^https:\/\/accounts\.google\.com\//.test(url)) {
      const text = (await win.locator('body').innerText().catch(() => '')).trim();
      fail(name, `did not reach accounts.google.com (stuck at ${url.split('?')[0]}; page text: ${JSON.stringify(text.slice(0, 200))})`);
    } else {
      const text = await win.locator('body').innerText().catch(() => '');
      if (/redirect_uri_mismatch|invalid_request|Error 400|Access blocked|origin_mismatch/i.test(text))
        fail(name, `Google rejected the request: ${JSON.stringify(text.slice(0, 300))}`);
      const ret = new URL(url).searchParams.get('redirect_uri')
        || new URL(decodeURIComponent(new URL(url).searchParams.get('continue') || 'https://x/')).searchParams.get('redirect_uri');
      console.log('  Google will return to:', ret);
      if (ret) {
        const r = await ctx.request.get(ret + '?apiKey=check', { maxRedirects: 5 });
        const type = r.headers()['content-type'] || '';
        console.log(`  that address answers: ${r.status()} ${type} (final ${r.url().split('?')[0]})`);
        if (r.status() !== 200 || !type.startsWith('text/html')) fail(name, `return address ${ret} is not a working page`);
      }
    }
    if (errors.length) fail(name, 'page errors: ' + errors.join(' | '));
  } catch (e) {
    await page.screenshot({ path: `${OUT}/${name}-error.png` }).catch(() => {});
    fail(name, String(e));
  }
  await browser.close();
}

await run('desktop-chromium', chromium, { viewport: { width: 1280, height: 900 } });
await run('desktop-firefox', firefox, { viewport: { width: 1280, height: 900 } });
await run('iphone-webkit', webkit, { ...devices['iPhone 13'] });
await run('android-chromium', chromium, { ...devices['Pixel 7'] });

console.log(failures.length ? `\n${failures.length} sign-in check(s) failed:\n- ` + failures.join('\n- ') : '\nAll sign-in checks passed.');
process.exit(failures.length ? 1 : 0);
