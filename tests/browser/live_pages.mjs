// Drive live.js in a real DOM (jsdom) against examples/app (template components).
// cd examples/app && PORT=3000 quirk run _browser_main.qk    then: node live_pages.mjs http://localhost:3000
import { JSDOM } from 'jsdom';
const base = process.argv[2];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failures++; };

// A browser's cookie jar (Node's fetch keeps none): the session cookie.
const jar = {};
async function jarFetch(u, o = {}) {
  const headers = Object.assign({}, o.headers || {});
  const c = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
  if (c) headers['Cookie'] = c;
  const r = await fetch(u, Object.assign({}, o, { headers, redirect: 'manual' }));
  for (const sc of r.headers.getSetCookie()) {
    const [kv] = sc.split(';');
    const eq = kv.indexOf('=');
    const k = kv.slice(0, eq).trim(), v = kv.slice(eq + 1).trim();
    if (/Max-Age=0/i.test(sc)) delete jar[k]; else jar[k] = v;
  }
  return r;
}
async function open(path) {
  const html = await (await jarFetch(base + path)).text();
  const dom = new JSDOM(html, { url: base + path, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = (u, o) => jarFetch(new URL(u, base), o);
  // jsdom has no EventSource: a small one over a streaming fetch.
  w.EventSource = class {
    constructor(url) {
      this.listeners = {};
      this.ctrl = new AbortController();
      const run = async () => {
        const headers = {};
        const c = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
        if (c) headers['Cookie'] = c;
        const r = await fetch(new URL(url, base), { headers, signal: this.ctrl.signal });
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let at;
          while ((at = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, at);
            buf = buf.slice(at + 2);
            let ev = 'message';
            const data = [];
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) ev = line.slice(7);
              else if (line.startsWith('data: ')) data.push(line.slice(6));
            }
            if (data.length) (this.listeners[ev] || []).forEach(f => f({ data: data.join('\n') }));
          }
        }
      };
      run().catch(() => {});
    }
    addEventListener(ev, f) { (this.listeners[ev] = this.listeners[ev] || []).push(f); }
    close() { this.ctrl.abort(); }
  };
  w.__streams = w.__streams || [];
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

// The todos are in SQLite (src/store.qk): ticked off, seen by another tab, still there after a reload.
const row = (text) => [...d().querySelectorAll('ul > li')].find(li => li.textContent.includes(text));
row('walk the dog').querySelector('input[type=checkbox]').click();
check(await until(() => !!row('walk the dog') && !!row('walk the dog').querySelector('span.done')), 'ticked: shown as done');
check(d().querySelector('.left').textContent.trim().startsWith('2 left'), 'the count: ' + d().querySelector('.left').textContent.trim());
const other = await open('/todos');
const od = () => other.document;
check(await until(() => !!od().querySelector('ul') && od().querySelector('ul').textContent.includes('feed the cat')), 'another visitor sees the same todos (the database)');
check(!![...od().querySelectorAll('ul > li')].find(li => li.textContent.includes('walk the dog')).querySelector('span.done'), 'done there too');
type(input('Something to do'), 'from tab one');
button('Add').click();
check(await until(() => od().querySelector('ul').textContent.includes('from tab one'), 3000), 'added in one tab: the other shows it (published)');
other.close();
const again = await open('/todos');
check(await until(() => !!again.document.querySelector('ul') && again.document.querySelector('ul').textContent.includes('from tab one')), 'a new page load: still there');
again.close();

w.history.back();
check(await until(() => !!d().querySelector('.count')), 'Back: the counter page again');

// Notifications (self.notify, like Element Plus): corners, enter / leave
// transitions, pause on hover, on_click. (Back gave a fresh counter page.)
const notes = () => [...d().querySelectorAll('.q-notification:not([q-leaving])')];
const note = (text) => notes().find(n => n.textContent.includes(text));
// (a corner still playing its leave transition doesn't count: in jsdom,
// animations never end, so it stays until the 1.5 s fallback)
const corner = (pos) => d().querySelector('.q-notifications-' + pos + ':not([q-leaving])');
// (notifications belong to the layout: the one from the first visit outlives
// the page change, as in Element Plus — wait for it to close on its own)
check(await until(() => notes().length === 0 && !corner('top-right'), 7000), 'the earlier notification closes by itself (it outlived the page change)');
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

// MainLayout: it stays while you go between its pages; only the page changes.
const link = (href) => [...d().querySelectorAll('a[q-link]')].find(a => a.getAttribute('href') === href);
const go = (href) => link(href).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
const scratch = () => d().querySelector('.scratchpad input');
const nav = d().querySelector('.layout nav');
const rootId = d().querySelector('[q-root]').getAttribute('q-root');
check(link('/').classList.contains('active'), 'the layout marks the current page\'s link');
type(scratch(), 'remember me');
await sleep(400);                                                    // the typing reaches the server
go('/todos');
check(await until(() => !!input('Something to do')), 'Todos, in the same layout');
check(d().querySelector('.layout nav') === nav, 'the layout\'s elements are the same (not rebuilt)');
check(d().querySelector('[q-root]').getAttribute('q-root') === rootId, 'the same layout object on the server');
check(scratch().value === 'remember me', 'the scratchpad kept its text');
check(link('/todos').classList.contains('active') && !link('/').classList.contains('active'), 'the active link moved');
check(/[0-9]+ pages in this layout/.test(d().querySelector('.scratchpad small').textContent), 'on_navigate counted: ' + d().querySelector('.scratchpad small').textContent);
go('/hello/world');
check(await until(() => !!d().getElementById('hello')) && scratch().value === 'remember me', 'Hello too, the text still there');
check(link('/hello/world').classList.contains('active'), 'path.startswith(\'/hello\') marks it');

// Login: a guarded page, the login form, back to it; then log out.
go('/account');
check(await until(() => !!input('Password')), 'Account (guarded): the login page instead');
check(w.location.pathname === '/login' && w.location.search.includes('next='), 'URL: ' + w.location.pathname + w.location.search);
// Validation (rules()): leaving an empty field shows its error; typing clears it.
const shownError = () => [...d().querySelectorAll('.q-error')].filter(p => !p.hidden).map(p => p.textContent.trim()).join(' | ');
const submitForm = () => d().querySelector('form.login').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
input('Email').focus();
input('Email').dispatchEvent(new w.FocusEvent('focusout', { bubbles: true }));
check(await until(() => shownError() === 'Your email, please'), 'leaving the empty email: its error (' + shownError() + ')');
check(input('Email').getAttribute('aria-invalid') === 'true', 'the input says it\'s invalid (aria-invalid)');
type(input('Email'), 'ada@example.com');
check(await until(() => shownError() === '' && !input('Email').hasAttribute('aria-invalid')), 'typing an email clears it');
type(input('Password'), 'not an account');
submitForm();
check(await until(() => shownError() === 'Wrong email or password'), 'no such account: its error, from the server (' + shownError() + ')');
// Sign up (the password is stored as a scrypt hash), then you're in.
go('/signup');
check(await until(() => !!input('Password again')), 'the sign-up page');
type(input('Name'), 'ada');
type(input('Email'), 'ada@example.com');
type(input('Password'), 'short');
type(input('Password again'), 'short');
submitForm();
check(await until(() => shownError() === 'At least 8 characters'), 'a short password: refused (' + shownError() + ')');
type(input('Password'), 'analytical engine');
type(input('Password again'), 'analytical engine');
submitForm();
check(await until(() => !!d().querySelector('.account'), 4000), 'signed up: the account page');
check(w.location.pathname === '/account', 'URL: ' + w.location.pathname);
check(d().querySelector('.account').textContent.includes('ada') && d().querySelector('.who').textContent.includes('ada'), 'the page and the layout know who');
check(!!jar.quirk_session, 'the session cookie is set');
check(d().querySelector('.layout nav') === nav && scratch().value === 'remember me', 'the layout stayed through the login');
check(await until(() => !!note('Welcome, ada!')), 'a welcome notification');

// Nested layouts: the account pages are in AccountLayout, inside MainLayout.
const area = d().querySelector('.account-area');
check(!!area && !!area.closest('.layout section.page'), 'AccountLayout inside MainLayout\'s slot');
go('/account/settings');
check(await until(() => !!d().querySelector('input[type=checkbox]')), 'Settings: in the same account area');
check(d().querySelector('.account-area') === area && d().querySelector('.layout nav') === nav, 'both layouts stayed (the same elements)');
check(/2 account pages/.test(area.querySelector('small').textContent), 'AccountLayout\'s on_navigate: ' + area.querySelector('small').textContent);
check(link('/account').classList.contains('active') && link('/account/settings').classList.contains('on'), 'both layouts mark their link');
go('/todos');
check(await until(() => !!d().querySelector('input[placeholder="Search"]') && !d().querySelector('.account-area')), 'out of the account pages: AccountLayout gone');
check(d().querySelector('.layout nav') === nav && scratch().value === 'remember me', 'MainLayout stayed');
go('/account');
check(await until(() => !!d().querySelector('.account')) && /1 account page$/.test(d().querySelector('.account-area small').textContent.trim()), 'back in: a new AccountLayout');
d().querySelector('.who button').click();
check(await until(() => w.location.pathname === '/' && d().querySelector('.who').textContent.includes('Log in')), 'logged out: home, "Log in" again');
check(!jar.quirk_session, 'the cookie is cleared');
go('/account');
check(await until(() => !!input('Password')), 'Account: the login page again');
// Logging in with the account: its stored hash checked.
type(input('Email'), 'ADA@example.com');                     // any case
type(input('Password'), 'analytical engine');
submitForm();
check(await until(() => !!d().querySelector('.account'), 4000), 'logged in with the new account');
check(await until(() => !!note('Welcome back, ada!')), 'welcomed back');

// Live updates: the page changes without the visitor doing anything.
go('/live');
check(await until(() => !!d().querySelector('.clock')), 'the Live page');
const before = d().querySelector('.clock').textContent;
check(await until(() => d().querySelector('.clock').textContent !== before, 3500), 'the clock ticks from the server: ' + d().querySelector('.clock').textContent);
// A second tab: what one writes, the other shows.
const w2 = await open('/live');
const d2 = () => w2.document;
check(await until(() => d().querySelector('.here').textContent.startsWith('2'), 3000), 'the first tab sees the second arrive: ' + d().querySelector('.here').textContent);
const box2 = d2().querySelector('input[placeholder="Message"]');
box2.value = 'hi from tab 2';
box2.dispatchEvent(new w2.Event('input', { bubbles: true }));
box2.dispatchEvent(new w2.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
check(await until(() => d().querySelector('.chat').textContent.includes('hi from tab 2'), 3000), 'tab 1 got tab 2\'s message, pushed');
check(d().querySelector('.layout nav') === nav, 'the layout stayed (pushes only morph)');
w2.close();

console.log(failures ? failures + ' failed' : 'all passed');
process.exit(failures ? 1 : 0);
