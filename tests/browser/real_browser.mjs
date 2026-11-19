// The demo app in a real browser (headless Chromium, through Playwright):
// what jsdom can't show — CSS animations ending, where things are on the
// screen, the real mouse and keyboard, EventSource, HttpOnly cookies.
//   cd examples/app && PORT=3000 quirk run _browser_main.qk
//   cd tests/browser && npm install && npx playwright install chromium
//   node real_browser.mjs http://localhost:3000 [screenshots-folder]
import { chromium } from 'playwright';
import fs from 'fs';

const base = process.argv[2];
const shots = process.argv[3] || '';
if (shots) fs.mkdirSync(shots, { recursive: true });
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failures++; };
const snap = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
const errors = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
const page = await context.newPage();
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base + '/');
await page.waitForSelector('.count');
check((await page.textContent('.count')).trim() === '0', 'the counter page');

// ---- Notifications: corners, real animations, hover ----
await page.click('button.plus:has-text("+10")');
const success = page.locator('.q-notification', { hasText: 'You reached 10!' });
await success.waitFor();
const vp = page.viewportSize();
const box = await success.boundingBox();
check(box && box.x + box.width > vp.width - 60 && box.y < 80, `success: in the top-right corner (${Math.round(box.x)},${Math.round(box.y)})`);
const left = page.locator('.q-notification', { hasText: 'in one go' });
await left.waitFor();
await page.waitForTimeout(400);                       // (it slides in from the left edge)
const lbox = await left.boundingBox();
check(lbox && lbox.x >= 0 && lbox.x < 60 && lbox.y + lbox.height > vp.height - 80, `the component's one: bottom-left (${Math.round(lbox.x)},${Math.round(lbox.y)})`);
// The entrance runs and ends: animationend removes the class (well before the 1.5 s fallback).
await page.waitForTimeout(450);
check(!(await success.getAttribute('class')).includes('q-note-right-enter'), 'the entrance animation ended (its class removed by animationend)');
await snap(page, '1-notifications');

// Hover: the success one (4.5 s) stays while the mouse is on it.
await success.hover();
await page.waitForTimeout(5000);
check(await success.isVisible(), 'hovered: still there after its 4.5 s');
await page.mouse.move(vp.width / 2, vp.height / 2);
const t0 = Date.now();
await success.waitFor({ state: 'detached', timeout: 7000 });
check(Date.now() - t0 > 300, `mouse gone: it closed after the time it had left (${Date.now() - t0} ms)`);

// Close with ×: the exit plays (the entrance backwards), then it's removed.
await page.click('button:has-text("reset")');
const info = page.locator('.q-notification:not([q-leaving])', { hasText: 'Counter reset' });
await info.waitFor();
await page.waitForTimeout(400);
const closing = Date.now();
await info.locator('.q-notification-close').click();
const leaving = page.locator('.q-notification[q-leaving]', { hasText: 'Counter reset' });
check(await leaving.count() === 1, 'closing: it stays a moment, leaving');
const dir = await leaving.evaluate(e => getComputedStyle(e).animationName + ' ' + getComputedStyle(e).animationDirection).catch(() => '');
check(/q-note-in-left reverse/.test(dir), `its exit is the entrance played backwards (${dir})`);
await page.locator('.q-notification', { hasText: 'Counter reset' }).waitFor({ state: 'detached', timeout: 3000 });
const took = Date.now() - closing;
check(took > 150 && took < 1200, `removed when the animation ended (${took} ms, not the 1.5 s fallback)`);

// ---- Typing: focus and every character, while the page updates ----
await page.click('a[href="/todos"]');
await page.waitForSelector('input[placeholder="Search"]');
const search = page.locator('input[placeholder="Search"]');
await search.click();
await page.keyboard.type('write d', { delay: 60 });          // (live_pages.mjs removed "buy milk")
await page.waitForTimeout(500);
check(await search.inputValue() === 'write d', 'typed while the list filtered: every character kept (' + await search.inputValue() + ')');
check(await search.evaluate(e => e === document.activeElement), 'and the field kept its focus');
check(await page.locator('ul > li').count() === 1, 'the list filtered live');
// <style scoped> in TodoRow: its × is red; the page's own buttons aren't touched.
const xColor = await page.locator('button.remove').first().evaluate(e => getComputedStyle(e).color);
const addColor = await page.locator('button:has-text("Add")').evaluate(e => getComputedStyle(e).color);
check(xColor === 'rgb(220, 38, 38)', 'scoped CSS: TodoRow\'s × is red (' + xColor + ')');
check(addColor !== 'rgb(220, 38, 38)', 'and only there: the page\'s Add button isn\'t (' + addColor + ')');
const rowAttr = await page.locator('button.remove').first().evaluate(e => [...e.attributes].map(a => a.name).find(n => n.startsWith('data-q-')));
check(!!rowAttr && !(await page.locator('button:has-text("Add")').evaluate((e, a) => e.hasAttribute(a), rowAttr)), 'the scope attribute is on TodoRow\'s elements only (' + rowAttr + ')');
const caret = await search.evaluate(e => e.selectionStart);
check(caret === 7, 'the caret stayed at the end (' + caret + ')');
await search.fill('');
await search.dispatchEvent('input');

// ---- Layout: the same elements across pages; Back / Forward ----
const marked = await page.evaluate(() => { document.querySelector('.layout nav').__mark = 42; return true; });
await page.locator('.scratchpad input').fill('kept');
await page.locator('.scratchpad input').dispatchEvent('input');
await page.waitForTimeout(400);
await page.click('a[href="/hello/world"]');
await page.waitForSelector('#hello');
check(marked && await page.evaluate(() => document.querySelector('.layout nav').__mark === 42), 'the layout\'s elements stayed (not rebuilt)');
check(await page.locator('.scratchpad input').inputValue() === 'kept', 'the scratchpad kept its text');
await page.goBack();
await page.waitForSelector('input[placeholder="Search"]');
check(new URL(page.url()).pathname === '/todos', 'Back: the todos page');
await page.goForward();
await page.waitForSelector('#hello');
check(new URL(page.url()).pathname === '/hello/world', 'Forward: hello again');

// ---- Login: the cookie is HttpOnly ----
await page.click('a[href="/account"]');
await page.waitForSelector('input[placeholder="Password"]');
await page.fill('input[placeholder="Name"]', 'ada');
await page.fill('input[placeholder="Password"]', 'quirk');
await page.locator('input[placeholder="Password"]').dispatchEvent('input');
await page.waitForTimeout(300);
await page.click('form.login button');
await page.waitForSelector('.account');
check((await page.textContent('.account')).includes('ada'), 'logged in: the account page');
const cookies = await context.cookies();
const sess = cookies.find(c => c.name === 'quirk_session');
check(sess && sess.httpOnly && sess.sameSite === 'Lax', 'the session cookie: HttpOnly, SameSite=Lax');
check(!(await page.evaluate(() => document.cookie)).includes('quirk_session'), 'page scripts can\'t read it');
await snap(page, '2-account');

// ---- Live updates: a real EventSource, two tabs ----
await page.click('a[href="/live"]');
await page.waitForSelector('.clock');
const c1 = await page.textContent('.clock');
await page.waitForTimeout(2300);
check((await page.textContent('.clock')) !== c1, 'the clock ticks from the server (' + (await page.textContent('.clock')).trim() + ')');
check(await page.locator('.clock').evaluate(e => getComputedStyle(e).color) === 'rgb(47, 111, 224)', 'scoped CSS: the clock\'s color, still after its updates');
const tab2 = await context.newPage();
await tab2.goto(base + '/live');
await tab2.waitForSelector('.clock');
await page.waitForFunction(() => /^[2-9]/.test(document.querySelector('.here').textContent.trim()), null, { timeout: 4000 }).catch(() => {});
check(/^[2-9]/.test((await page.textContent('.here')).trim()), 'tab 1 sees tab 2 arrive (' + (await page.textContent('.here')).trim() + ')');
await tab2.fill('input[placeholder="Message"]', 'hello from tab 2');
await tab2.locator('input[placeholder="Message"]').dispatchEvent('input');
await tab2.press('input[placeholder="Message"]', 'Enter');
await page.waitForFunction(() => document.querySelector('.chat').textContent.includes('hello from tab 2'), null, { timeout: 4000 }).catch(() => {});
check((await page.textContent('.chat')).includes('hello from tab 2'), 'tab 1 got the message, pushed');
await snap(page, '3-live');
await tab2.close();
// The server outlives closed tabs (their streams break).
await page.waitForTimeout(1500);
const again = await (await fetch(base + '/')).status;
check(again === 200, 'the server is fine after a tab closed (' + again + ')');

// ---- Reduced motion: notifications don't animate ----
const rm = await browser.newContext({ reducedMotion: 'reduce' });
const quiet = await rm.newPage();
await quiet.goto(base + '/');
await quiet.waitForSelector('.count');
await quiet.click('button:has-text("reset")');
const qn = quiet.locator('.q-notification', { hasText: 'Counter reset' });
await qn.waitFor();
const ms = Date.now();
await qn.locator('.q-notification-close').click();
await quiet.locator('.q-notification', { hasText: 'Counter reset' }).waitFor({ state: 'detached', timeout: 3000 });
check(Date.now() - ms < 250, `reduced motion: closed without an animation (${Date.now() - ms} ms)`);
await rm.close();

check(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
