// Drive live.js in a real DOM (jsdom) against examples/app (template components).
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
check(await until(() => count() === '1'), 'a <PlusButton /> component adds 1');
for (let i = 0; i < 9; i++) button('+1').click();           // fast clicks: queued, none lost
check(await until(() => count() === '10'), 'ten quick clicks: 10');
check(await until(() => d().body.textContent.includes("That's a lot!")), 'an {% if %} block appears');
check(button('+1') === plus, 'the button element is kept (morphed)');
check(d().title === 'Counter (10)', 'title: ' + d().title);
button('−1').click();
check(await until(() => count() === '9' && !d().body.textContent.includes("That's a lot!")), '@click="add(-1)": 9');

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
check(await until(() => !d().querySelector('ul').textContent.includes('buy milk')), 'a TodoRow emits remove: the page removes the item');

w.history.back();
check(await until(() => !!d().querySelector('.count')), 'Back: the counter page again');

// Notifications: @after timers in the browser, enum props, emit.
[...d().querySelectorAll('a[q-link]')].find(a => a.getAttribute('href') === '/notifications')
  .dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
const notes = () => [...d().querySelectorAll('.notification')];
check(await until(() => notes().length === 1), 'notifications page: the welcome one');
check(notes()[0].classList.contains('info') && notes()[0].getAttribute('role') === 'status', 'Info: class and role');
button('Error (stays)').click();
check(await until(() => notes().length === 2), 'an error notification appears');
const err = () => notes().find(n => n.classList.contains('error'));
check(err() && err().getAttribute('role') === 'alert', 'Error: role=alert');
// A custom one that closes after 400 ms.
type(input('Your message'), 'quick one');
const number = d().querySelector('input[type=number]');
type(number, '400');
const sel = d().querySelector('select');
sel.value = 'Success';
sel.dispatchEvent(new w.Event('change', { bubbles: true }));
d().querySelector('form.custom').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
check(await until(() => notes().some(n => n.textContent.includes('quick one'))), 'the custom one appears');
check(notes().find(n => n.textContent.includes('quick one')).classList.contains('success'), 'with the status picked');
const welcome = () => notes().find(n => n.textContent.includes('Welcome'));
const errBefore = err();
check(await until(() => !notes().some(n => n.textContent.includes('quick one')), 2500), 'it closes by itself after its timeout');
check(!!welcome(), 'the welcome one (6 s) is still there');
check(err() === errBefore, 'the error one is the same element');
await sleep(500);
check(!!err(), 'the error one (timeout 0) stays');
err().querySelector('button.close').click();
check(await until(() => !err()), '× closes it (emit dismiss → the page removes it)');

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
