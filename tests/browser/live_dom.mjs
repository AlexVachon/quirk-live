// Drive live.js in a real DOM (jsdom) against the running demo server.
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
  const js = await (await fetch(base + '/_live/live.js')).text();
  w.eval(js);
  return w;
}
async function until(cond, ms = 2000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (cond()) return true; await sleep(20); }
  return false;
}

let w = await open('/');
const d = () => w.document;
check(d().getElementById('count').textContent === '0', 'counter starts at 0');
d().getElementById('inc').click();
check(await until(() => d().getElementById('count').textContent === '1'), 'click +1 updates the page in place');
const btn = d().getElementById('inc');
for (let i = 0; i < 9; i++) { d().getElementById('inc').click(); await sleep(30); }
check(await until(() => d().getElementById('count').textContent === '10'), 'ten clicks: 10');
check(await until(() => !!d().getElementById('big')), 'a conditional block appears');
check(d().getElementById('inc') === btn, 'the button element is kept (morphed, not replaced)');
check(d().title === 'Counter (10)', 'the title follows the state: ' + d().title);
d().getElementById('dec').click();
check(await until(() => d().getElementById('count').textContent === '9' && !d().getElementById('big')), 'click -1: 9, block gone');

// Navigation without reload.
const todosLink = [...d().querySelectorAll('a[q-link]')].find(a => a.getAttribute('href') === '/todos');
todosLink.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
check(await until(() => !!d().getElementById('list')), 'q-link: the todos page, no reload');
check(w.location.pathname === '/todos', 'the URL changed: ' + w.location.pathname);
check(d().getElementById('list').children.length === 2, 'two todos');

// Submit a form.
const input = d().getElementById('new');
input.value = 'walk the dog';
d().getElementById('add').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
check(await until(() => d().getElementById('list').textContent.includes('walk the dog')), 'q-submit adds a todo');

// Typing (q-input): the field keeps its text and focus while the list filters.
const search = d().getElementById('search');
search.focus();
search.value = 'milk';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
check(await until(() => d().getElementById('list').children.length === 1), 'q-input filters live');
check(d().activeElement === search && search.value === 'milk', 'the search field keeps focus and text');

// Remove with a q-value.
search.value = '';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
await until(() => d().getElementById('list').children.length === 3);
d().querySelector('#list li button').click();
check(await until(() => d().getElementById('list').children.length === 2 && !d().getElementById('list').textContent.includes('buy milk')), 'q-click with q-value removes the first todo');

// Params page via navigation, then Back.
const hello = [...d().querySelectorAll('a[q-link]')].find(a => a.getAttribute('href') === '/hello/world');
hello.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
check(await until(() => d().getElementById('hello') && d().getElementById('hello').textContent === 'Hello, world!'), 'a :param page');
w.history.back();
check(await until(() => !!d().getElementById('list')), 'Back returns to todos');

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
