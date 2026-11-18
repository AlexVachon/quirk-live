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

// Notifications (self.notify, like Element Plus): corners, enter / leave
// transitions, pause on hover, on_click. (Back gave a fresh counter page.)
const notes = () => [...d().querySelectorAll('.q-notification:not([q-leaving])')];
const note = (text) => notes().find(n => n.textContent.includes(text));
// (a corner still playing its leave transition doesn't count: in jsdom,
// animations never end, so it stays until the 1.5 s fallback)
const corner = (pos) => d().querySelector('.q-notifications-' + pos + ':not([q-leaving])');
check(notes().length === 0 && !corner('top-right'), 'no notifications yet');
button('+10').click();
check(await until(() => !!note('You reached 10!')), '+10: a success notification');
check(corner('top-right') && corner('top-right').contains(note('You reached 10!')), 'in the top-right corner');
check(note('You reached 10!').classList.contains('q-note-right-enter'), 'it enters with a transition (q-note-right-enter)');
check(await until(() => !!note('in one go')) && corner('bottom-left').contains(note('in one go')), 'the component\'s one: bottom-left');
check(note('in one go').getAttribute('q-transition') === 'q-note-left', 'left corners slide from the left');
// Pause on hover: the success one (4.5 s) stays while the mouse is on it.
const success = note('You reached 10!');
success.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
// Leave: the bottom-left one (2.5 s) closes; it stays a moment with q-note-left-leave.
// (no q-note-left-leave animation in the CSS: the entrance, reversed)
check(await until(() => { const e = d().querySelector('.q-notification[q-leaving]'); return e && e.classList.contains('q-note-left-enter') && e.style.animationDirection === 'reverse'; }, 4000),
      'a closing one leaves with its entrance played backwards');
check(await until(() => !d().querySelector('.q-notifications-bottom-left .q-notification'), 2500), 'then it is removed');
await sleep(3000);
check(note('You reached 10!') === success, 'hovered: the success one is still there after its 4.5 s');
success.dispatchEvent(new w.MouseEvent('mouseout', { bubbles: true, relatedTarget: d().body }));
check(await until(() => !note('You reached 10!'), 6000), 'mouse gone: its timer resumes (with the time it had left) and it closes');
// on_click: the reset one undoes the reset.
check(count() === '10', 'count 10');
button('reset').click();
check(await until(() => !!note('click here to undo') && count() === '0'), 'reset: 0, and a notification top-left');
check(corner('top-left') && note('click here to undo').classList.contains('q-notification-clickable'), 'top-left, clickable');
note('click here to undo').querySelector('.q-notification-message').click();
check(await until(() => count() === '10' && !note('click here to undo')), 'clicking it undoes the reset and closes it');
// A warning that stays, closed with ×.
for (let i = 0; i < 11; i++) button('−1').click();
check(await until(() => !!note('below zero')), 'below zero: a warning, bottom-right');
check(corner('bottom-right').contains(note('below zero')) && note('below zero').getAttribute('role') === 'alert', 'bottom-right, role=alert');
note('below zero').querySelector('.q-notification-close').click();
check(await until(() => !note('below zero')), '× closes it');
check(await until(() => d().querySelector('.closed') && d().querySelector('.closed').textContent.includes('notifications closed: 3')), 'on_close ran for each: ' + (d().querySelector('.closed') || {}).textContent);

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
