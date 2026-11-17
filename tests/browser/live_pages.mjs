// Drive live.js in a real DOM (jsdom) against examples/app (live.Page widgets).
// cd examples/app && quirk run main.qk      then: node live_pages.mjs http://localhost:3000
import { JSDOM } from 'jsdom';
const base = process.argv[2];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failures++; };

async function open(path) {
  const html = await (await fetch(base + path)).text();
  const dom = new JSDOM(html, { url: base + path, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = (u, o) => fetch(new URL(u, base), o);
  w.scrollTo = () => {};
  w.eval(await (await fetch(base + '/_live/live.js')).text());
  return w;
}
async function until(cond, ms = 2000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (cond()) return true; await sleep(20); }
  return false;
}

const w = await open('/');
const d = () => w.document;
const button = (text) => [...d().querySelectorAll('button')].find(b => b.textContent === text);
const count = () => d().querySelector('.count').textContent;
const input = (ph) => d().querySelector('input[placeholder="' + ph + '"]');
const enter = (el) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
const type = (el, text) => { el.value = text; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

check(count() === '0', 'counter starts at 0');
const plus = button('+1');
button('+1').click();
check(await until(() => count() === '1'), 'the subclassed button (on_click override) adds 1');
for (let i = 0; i < 9; i++) button('+1').click();           // fast clicks: queued, none lost
check(await until(() => count() === '10'), 'ten quick clicks: 10');
check(await until(() => d().body.textContent.includes("That's a lot!")), 'a widget added by build()');
check(button('+1') === plus, 'the button element is kept (morphed)');
check(d().title === 'Counter (10)', 'title: ' + d().title);
button('−1').click();
check(await until(() => count() === '9' && !d().body.textContent.includes("That's a lot!")), 'callback button: 9');

[...d().querySelectorAll('a[q-link]')].find(a => a.getAttribute('href') === '/todos')
  .dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
check(await until(() => !!input('Something to do')), 'Link: the todos page without a reload');
check(w.location.pathname === '/todos', 'URL: ' + w.location.pathname);

// Type then Enter: the pending typing goes first, the field is cleared after.
const box = input('Something to do');
box.focus();
type(box, 'walk the dog');
enter(box);
check(await until(() => d().querySelector('ul').textContent.includes('walk the dog')), 'Enter adds the item');
check(await until(() => input('Something to do').value === ''), 'the focused field is cleared by the page');

// Type then click Add right away (before the typing pause ends).
type(input('Something to do'), 'feed the cat');
button('Add').click();
check(await until(() => d().querySelector('ul').textContent.includes('feed the cat')), 'click right after typing: nothing lost');

// Live search keeps focus and text.
const search = input('Search');
search.focus();
type(search, 'milk');
check(await until(() => d().querySelectorAll('ul > li').length === 1), 'search filters live');
check(d().activeElement === search && search.value === 'milk', 'search keeps focus and text');
type(search, '');
check(await until(() => d().querySelectorAll('ul > li').length === 4), 'all four back');

// A button inside a widget of your own.
d().querySelector('ul > li button').click();
check(await until(() => !d().querySelector('ul').textContent.includes('buy milk')), 'TodoRow × removes its item');

w.history.back();
check(await until(() => !!d().querySelector('.count')), 'Back: the counter page again');

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
