# live

Interactive web pages written in Quirk and HTML — like Vue, but the
components run on the server. A component is a **struct**: its state in
fields, its actions in methods, and its **HTML template** in the same file. A click
or a keystroke calls a method on the server, the page is rendered again, and
the browser updates in place — no reload, and **no JavaScript to write** (a
small fixed script that ships with this package does the browser's part).
It runs inside a [`web`](https://github.com/AlexVachon/quirk-web) app.

```
myapp/
├── index.html      the base page: <slot /> is where each page goes
├── router.qk       which page is at which path
├── main.qk         the server
└── src/
    └── counter.qk  struct CounterPage and struct PlusButton, each with its template
```

`src/counter.qk`:

```quirk
use live

struct CounterPage : live.Page {
    count: Int

    define on_load(self) -> void {         // once, when someone opens the page
        self.count = 0
    }

    define add(self, n: Int) -> void {
        self.count = self.count + n
    }

    define template(self) -> String {
        return r"""
            <h1>Count: {{ count }}</h1>
            <div class="buttons">
              <button @click="add(-1)">−1</button>
              <PlusButton :page="self" :step="1" />
              <PlusButton :page="self" :step="10" />
            </div>
            {% if count >= 10 %}<p>That's a lot!</p>{% end %}
        """
    }
}

struct PlusButton : live.Component {
    page: CounterPage
    step: Int

    define press(self) -> void {
        self.page.add(self.step)
    }

    define template(self) -> String {
        return r"""<button class="plus" @click="press">+{{ step }}</button>"""
    }
}
```

`r"""…"""` is a raw string: `$` and backslashes stay as written, so the
template is exactly the HTML you see.

`router.qk`:

```quirk
from live use { Router }
from src.counter use { CounterPage }

router = Router()
router.add("/", CounterPage)
```

`index.html`:

```html
<!doctype html>
<html>
<head><title>{{ title }}</title><link rel="stylesheet" href="/style.css"></head>
<body>
  <nav><a href="/" q-link>Counter</a></nav>
  <main><slot /></main>
</body>
</html>
```

`main.qk`:

```quirk
use web
from router use { router }

define main() -> void {
    app := web.App()
    app.use(web.static("public"))
    app.mount("/", router)
    app.listen(3000)
}
```

`quirk new --live myapp` makes such a project. The demo — a counter, a todo
list with live search, notifications, navigation — is in `examples/app`
(pages in `src/pages/`):
`cd examples/app && quirk run --watch main.qk`, then open http://localhost:3000.
Its todos are kept in SQLite (`src/store.qk`, the
[`sqlite`](https://github.com/AlexVachon/quirk-sqlite) package, in
`todos.db`): still there after a restart, shared by every visitor, and
changed in every open tab at once (`live.publish`); accounts are real (sign up,
passwords hashed with scrypt), and sessions are kept in the same database
(`web.sqlite_store`): you stay logged in across restarts. The demo needs Quirk
7.56.0 or later.

**While you work: `quirk run --watch main.qk`** (Quirk 7.52.0+). Each time you
save a `.qk`, `.html`, `.css` or `.js` file of the project, the server is
checked and started again, and the open tabs reload by themselves. If what you
saved doesn't compile, the errors are shown and the running version keeps
running. (What a page holds — fields, a half-typed form — starts anew; what's
in a database stays, sessions too with `web.sqlite_store`.)

## Components

A component is a struct that extends `live.Component`; a page extends
`live.Page` (a component the router serves). Its template is what its
`template(self)` method returns. If you'd rather keep the HTML in its own
file, leave `template()` out and put it in the `.html` file named after the
struct (`TodoRow` → `todo_row.html`) next to the `.qk` file; template files
are re-read when they change.

| | |
|---|---|
| `on_load(self)` | set up its state — runs once, before it's first shown (load from a database or an API here) |
| your methods | called by the template's events (`@click="add(1)"`) |
| `title(self) -> String` | a page's title |
| `self.emit("name", value)` | tell the parent component (its `@name="method"`) |
| `self.go("/path")` | after this event, show another page |
| `self.param("id")` · `self.query("q")` | a page's `/users/:id` part · `?q=` value |

## Templates

| | |
|---|---|
| `{{ count }}` | a field (or a method with no arguments), escaped |
| `{{ item.text }}` · `{{ items.length }}` · `{{ total() }}` | fields of fields, Map keys, lengths, method calls |
| `{{ html \| raw }}` | not escaped |
| `{% if count >= 10 and not done %} … {% elif … %} … {% else %} … {% end %}` | `== != < > <= >=`, `and or not`, `+ - * / %`, `cond ? a : b` |
| `{{ name.upper() }}` · `{{ path.startswith('/admin') }}` | String methods: `startswith`, `endswith`, `contains`, `upper`, `lower`, `trim`, `find`, `replace`; `list.contains(x)`, `map.has(k)` |
| `{% for item in items %} … {% else %} … {% end %}` | `else`: the list is empty; `{% for i, item in items %}` with the index (Maps: key, value) |
| `<button @click="save">` | calls `self.save()`; `@click="add(1)"` with arguments (evaluated when shown) |
| `@submit="save"` (a form) | `save(fields)` — a Map of the form's fields |
| `@input="search"` · `@change="pick"` · `@enter="send"` | `search(text)` while typing · on a change · on Enter |
| `<div @after="dismiss" delay="{{ timeout }}">` | `dismiss()` once, `delay` milliseconds after the element appears (`0`: never) |
| `<input model="draft">` | the field shows `self.draft` and sets it as you type (checkboxes: a Bool; `<select model=…>` too) |
| `:disabled="busy"` · `:href="link"` | an attribute from an expression (a Bool adds or leaves it out) |
| `title="Hi {{ name }}"` | `{{ }}` works in attributes |
| `<a href="/todos" q-link>` | go to another page without a reload (Back / Forward work) |

### Styles for one component

A `<style scoped>` in a component's template applies to that component's
elements only — not to the page around it, not to the components inside it:

```quirk
define template(self) -> String {
    return r"""
        <style scoped>
          .title { color: #2f6fe0; }
          button:hover { background: #eef; }
        </style>
        <h1 class="title">{{ name }}</h1>
        <button @click="save">Save</button>
    """
}
```

Each component type gets an attribute (`data-q-3fa2c1`) on the elements its
template writes, and its selectors are rewritten to need it
(`.title` → `.title[data-q-3fa2c1]`; `@media` blocks too, `@keyframes`
as they are). What a `<slot />` shows belongs to the component that wrote
it, and gets that one's styles. The CSS is added to the page once per
component type, however many are shown. A `<style>` without `scoped` is
global, as in any page.

### Using components

A tag named like a struct is that component: `<PlusButton />`, or with
content, `<Card title="…">…</Card>`.

- **Props**: `text="Hi {{ name }}"` sets the child's `text` field (text,
  converted to the field's type); `:count="n + 1"` sets it to a value
  (Lists, structs, `self`…). An enum field takes a variant's name
  (`status="Error"`), and shows as one (`{{ status }}`,
  `{% if status == "Error" %}`).
- **Events**: `@remove="remove"` runs the parent's `remove(value)` when the
  child calls `self.emit("remove", value)`.
- **Slots**: a `<slot />` in the child's template shows what its tag enclosed
  (rendered with the parent's fields).
- **State**: each child keeps its own fields between renders (it's the same
  object), and `on_load` runs once when it first appears. Children in a
  `{% for %}` are matched by position; give them `:key="item.id"` when the
  list's order changes.

## Forms and validation

A component's `rules()` says what its `model` fields must be: field name →
a List of rules.

```quirk
struct SignupPage : live.Page {
    email: String
    password: String
    confirm: String
    age: Int
    terms: Bool

    define rules(self) -> Map {
        return {
            "email":    [live.required(), live.email()],
            "password": [live.required(), live.min_length(8)],
            "confirm":  [live.check(fn(v) => v == self.password, "The passwords don't match")],
            "age":      [live.between(13, 120)],
            "terms":    [live.required("Accept the terms to go on")],
        }
    }

    define save(self) -> void {
        if not self.valid() { return }                  // the errors are shown
        if db().value("SELECT 1 FROM users WHERE email = ?", [self.email]) != null {
            self.set_error("email", "That email is already taken")
            return
        }
        ...
    }

    define template(self) -> String {
        return r"""
            <form @submit="save">
              <input model="email" placeholder="Email"> <FieldError field="email" />
              <input type="password" model="password" placeholder="Password"> <FieldError field="password" />
              ...
              <button>Sign up</button>
            </form>
        """
    }
}
```

- **When:** a field is checked when the visitor leaves it, and every field by
  `valid()` (on submit). Nothing shows while they're still typing — but once a
  field shows an error, it's checked again as they type, so it clears as soon as
  it's right.
- **Rules:** `required(message)`, `min_length(n)`, `max_length(n)`,
  `between(low, high)`, `email()`, `pattern("[A-Z]{3}-[0-9]+")` (the whole
  value), and `check(fn(v) => …, message)` for your own. Each takes the message
  to show; all but `required` let an empty value through (an optional field that
  must look right when filled in). A rule is just a function giving `""` or the
  message: `fn(v) => …`.
- **From the server:** `self.set_error(field, message)` — what only it can tell
  (taken, wrong password). `error(field)`, `errors()`, `has_errors()`,
  `validate(field)`, `clear_errors()`.
- **Showing it:** `<FieldError field="email" />` is a `<p class="q-error"
  role="alert">` (hidden when there's none; screen readers say it when it
  appears), or `{{ error('email') }}` anywhere. An input in error has
  `aria-invalid="true"`: style it with `input[aria-invalid="true"] { … }`.
- **Numbers:** text in an `Int` / `Double` field that isn't a number is an error
  ("Enter a whole number"), the field keeping its last value.
- **Testing:** `s.blur("Email")` leaves a field; then look at `s.html`.

The demo's sign-up and login pages (`examples/app/src/pages/signup.qk`, `login.qk`) use it.

## Notifications

Like Element Plus's `ElNotification`: call `notify` from any page or
component, nothing to put in the template — live shows it in a corner of the
page, slides it in, and closes it after a while.

```quirk
define save(self) -> void {
    // ...
    self.notify("Your changes were saved.", title="Saved", type="success")
}
```

| Option | |
|---|---|
| `message` | the text |
| `title=""` | in bold above it |
| `type=""` | `"success"`, `"warning"`, `"info"`, `"error"` (an icon and a color; errors and warnings are read out at once by screen readers) |
| `position` | `"top-right"` (default), `"top-left"`, `"bottom-right"`, `"bottom-left"`; they stack in their corner |
| `duration` | milliseconds before it closes (default 4500); `0`: until closed. The timer pauses while the mouse is on it |
| `show_close=true` | the × button |
| `icon=""` | instead of the type's |
| `on_click=fn() {...}` | when it's clicked |
| `on_close=fn() {...}` | when it closes (×, its timer, or `close_notification`) |

Defaults for the whole app, set once at startup (each `notify` can still
say otherwise):

```quirk
live.notification_defaults(position="bottom-right", duration=3000, max=5)
```

`max` is the most shown at once: over it, the oldest close (0: no limit).

`notify` returns the notification's id: `self.close_notification(id)`,
`self.close_notifications()` close them. The look is plain CSS
(`.q-notification`, `.q-notification-success`, `.q-notifications-top-right`,
…) added to every page; override it in your stylesheet.

The counter page in `examples/app` uses every option.

### Transitions, for your own components

What notifications use works for any element of a component:
`q-transition="fade"` gives it the class `fade-enter` when it appears and
`fade-leave` when it goes — it's removed when that animation ends. Without a
`fade-leave` animation, it leaves with its entrance played backwards, so
this is enough:

```css
.fade-enter { animation: fade-in .2s; }
@keyframes fade-in { from { opacity: 0; } }
```

Notifications close with their entrance reversed (they slide back out);
give `.q-note-right-leave` / `.q-note-left-leave` an animation for another
way out.

`q-pause-hover` on an element with `@after` stops its timer while the mouse
is on it.

## Layouts

What some pages are shown in — a sidebar, a header, an admin area — that
**stays** while you go from one of them to another: only its `<slot />`, the
page, changes. Its fields keep their values (an open menu stays open, a
half-typed search keeps its text); the browser updates only the page.

```quirk
struct MainLayout : live.Layout {
    menu_open: Bool

    define on_load(self) -> void { self.menu_open = false }      // once
    define toggle(self) -> void { self.menu_open = not self.menu_open }

    define template(self) -> String {
        return r"""
            <aside>
              <button @click="toggle">Menu</button>
              <a href="/" q-link :class="path == '/' ? 'active' : ''">Home</a>
              <a href="/todos" q-link :class="path == '/todos' ? 'active' : ''">Todos</a>
            </aside>
            <section><slot /></section>
        """
    }
}
```

and in `router.qk`:

```quirk
main := router.group(layout=MainLayout)
main.add("/", HomePage)
main.add("/todos", TodoPage)

router.add("/login", LoginPage)                  // no layout
router.add("/about", AboutPage, layout=MainLayout)   // or one page at a time
```

- `self.path` is the current path, `self.page` the page shown;
  `on_navigate(path)` runs each time the page changes (and for the first).
- The page is an ordinary page: its own fields, `on_load`, events,
  `title()` (the window's title), `notify`, `go`.
- Going to a page with another layout, or none, replaces everything.
- Notifications belong to the layout: they stay when the page changes.

`index.html` stays the outer page of the whole app.

### Layouts inside layouts

A group inside a group: its pages are in its layout, which is itself in the
outer group's `<slot />` — like an admin area inside the site's frame.

```quirk
main := router.group(layout=MainLayout)
main.add("/", HomePage)

admin := main.group(layout=AdminLayout, guard=only_admins)   // inside MainLayout
admin.add("/admin", AdminHome)
admin.add("/admin/users", UsersPage)
```

- Between two admin pages, **both** layouts stay; only the page changes.
- From an admin page to `/`, `MainLayout` stays and `AdminLayout` goes; the
  page takes its place in `MainLayout`'s slot. Coming back makes a new
  `AdminLayout` (its `on_load` again).
- Every layout that stays gets its `path` updated and `on_navigate(path)`.
- Guards add up: an inner group's pages are behind the outer group's guard
  *and* its own (the first one that turns the visitor away decides).
- Groups nest as deep as you like: `admin.group(layout=ReportsLayout)`.

## Login

With `app.use(web.sessions())` in the app (see
[web](https://github.com/AlexVachon/quirk-web#sessions-and-login)):

```quirk
// router.qk
account := main.group(layout=AccountLayout, guard=live.require_login())
account.add("/account", AccountPage)
account.add("/account/settings", SettingsPage)
main.add("/login", LoginPage)
```

```quirk
struct LoginPage : live.Page {
    name: String
    password: String

    define submit(self) -> void {
        if not check_password(self.name, self.password) { return }
        self.login(self.name)                       // a new session id, then the user stored
        next := self.query("next")                  // the page the guard sent us from
        self.go(next != "" ? next : "/account")
    }
    // template: <form @submit="submit"><input model="name"> ... </form>
}
```

- A guard runs when the page is opened, when a `q-link` goes to it, and
  before every event — a page still open after logging out sends its visitor
  to the login page at their next click.
- `live.require_login(redirect="/login")` lets logged-in visitors in and
  sends the others to `/login?next=<the page>`. A guard of your own is
  `fn(req) -> String`: `""` to let the visitor in, else where to send them
  (`router.add("/admin", AdminPage, guard=only_admins)`).
- In pages, layouts and components: `self.login(user)`, `self.logout()`,
  `self.user()` (in templates: `{% if user %}…{{ user }}…{% end %}`), and
  `self.session()` for anything else to keep (`self.session().set("cart", items)`).

**Accounts.** Store passwords with `crypto.hash_password` (scrypt, salted)
and check them with `crypto.verify_password` — never the password itself, nor
a plain `sha256`. The demo has it all: `/signup` (validation, "that email
already has an account"), `/login` against the `users` table, and
`src/store.qk` (the schema through `db.migrate`, rows as structs with
`query_as`, and a login that takes as long whether or not the email has an
account).

## Live updates from the server

A page can change without its visitor doing anything — a clock, a job's
progress, what another visitor just did. Each open page keeps one stream to
the server (it reconnects by itself), and these show the page again:

```quirk
struct ChatPage : live.Page {
    define on_load(self) -> void {
        self.subscribe("chat")                         // get live.publish("chat", ...)
        self.every(1000, fn() { self.now = clock() })  // a timer on the server, while the page is open
    }

    define send(self) -> void {
        save_message(self.draft)
        live.publish("chat", self.draft)               // every subscribed page: on_message, then shown again
    }

    define on_message(self, topic: String, data: Any) -> void {
        // update fields from data (or read them again where they're kept)
    }
}
```

- `self.refresh()` — show the page again now, after a change made outside
  an event (a background task, another page).
- `self.every(ms, fn() {...})` — runs while the page is open, then shows it
  again; it stops when the visitor leaves (navigates away, or closes the tab).
- `self.subscribe(topic)` / `unsubscribe(topic)`; `live.publish(topic,
  data)` from anywhere — another visitor's event, a route, a timer;
  `live.subscribers(topic)` counts the pages open now.
- In tests, `TestSession.receive()` takes what was pushed (true if anything).

The demo's Live page (`examples/app/src/pages/live.qk`) has a clock and a
chat between tabs. Each open tab holds a connection to the server.

## The base page

`index.html` in the app's folder (the folder you run it from), when it has a
`<slot />`, is the page every page is shown in: `<slot />` is replaced by the
page and `{{ title }}` by its title; the browser script is added for you.
`live.configure(layout_file="views/base.html")` picks another file. Without
one, pages get a plain HTML page (`live.configure(head="<link …>")` adds to
its `<head>`).

## The router

`live.Router` is a `web.Router`: `router.add("/todos", TodoPage)` takes the
page struct itself (a new one for each visitor, kept on the server while they
use it — `live.session_minutes(n)`, default 30). It can hold ordinary routes
too (`router.get("/api/items", handler)`). Mount it at "/" — the browser
script talks to `/_live/`.

## Testing

`live.TestSession(app)` drives pages without a browser:

```quirk
define test_counter() -> void {
    s := live.TestSession(make_app())
    s.open("/")
    s.click("+1")                        // the element showing "+1"
    test.assert_true(s.html.contains("Count: 1"))
    s.navigate("/todos")
    s.submit("New item", "milk")         // type into the field with that placeholder, press Enter
    s.type("Search", "mi")               // @input / model=
    s.blur("Search")                     // leave the field: its rules() are checked
    s.check("Done only")                 // a checkbox, by its label
    s.choose("high")                     // a <select>'s option
    s.submit_form("text", {"text": "eggs"})
    s.run_timers()                       // every @after on the page, now
}
```

`html` is the page's current HTML, `title` its title, `location` its path.

`tests/browser/` checks the browser script itself, against the demo app
running (`cd examples/app && PORT=3000 quirk run _browser_main.qk`):

- in jsdom — `cd tests/browser && npm install && node live_pages.mjs http://localhost:3000`;
- in a real, headless Chromium — `npx playwright install chromium` once, then
  `node real_browser.mjs http://localhost:3000 [screenshots-folder]`: CSS
  animations ending, where things are on the screen, the mouse and the
  keyboard, EventSource, HttpOnly cookies.

GitHub Actions runs all of it on every push (`.github/workflows/test.yml`).

## Widgets (pages in Quirk only)

A page can also be built from widgets instead of a template — override
`build(self) -> live.Widget`:

```quirk
define build(self) -> live.Widget {
    return live.Column([
        live.Heading("Counter"),
        live.Label("Count: " + String(self.count)),
        live.Button("+1", on_click=fn() { self.count = self.count + 1 }),
    ])
}
```

Label, Heading, Button, Link, TextInput, TextArea, Checkbox, Dropdown, Slider,
ListView, Table, Image, Spacer, Html, Column and Row, named like the desktop
[`ui`](https://github.com/AlexVachon/quirk-ui) widgets; handlers are callbacks
(`on_click=fn() {...}`) or overridden methods (`struct PlusButton :
live.Button { define on_click(self) ... }`); `with_class` / `with_style`
style them; widgets of your own subclass `live.Widget` and return what
they're made of from `build()`.

## Reflection

What templates use, for your code too: `live.get_field(obj, "name")`,
`set_field`, `has_field`, `field_names`, `field_type`, `call_method(obj,
"name", [args])`, `has_method`, `method_names`, `type_name`, `new_struct("Name")`.

## How it works

The page holds `<div q-root="ID">`. Each `@click` / `model` in the rendered
template gets a numbered handler; the script sends each event as JSON to
`/_live/event`; the server finds the page by its ID (128 random bits), calls
the method, renders the page again, and answers with the new HTML, which the
script morphs into the page — the field you're typing in keeps its focus and
text, unchanged elements stay as they are, and a component's element is
matched by its key (moved, not rewritten, when a list changes). Events are sent in order, and
typing that hasn't been sent yet goes before a click. Links ask `/_live/nav`
for the next page. Every interaction is a round trip, so live suits forms,
dashboards, lists and admin pages; it's not for offline use or animations.

The 1.0 way still works: a `live.Component` overriding `render()` (HTML,
often `live.html(template, data)`) and `handle(event, data)`, with
`q-click="name"` / `q-submit` / `q-input` / `q-change` / `q-enter` attributes,
served with `live.page(app, "/", fn(req) { return Counter() })`.

## Requirements

Quirk 7.44.1 or newer (run-time reflection, enum fields by name, raw
strings, `type=` as an argument name, a page struct passed by name to
`router.add`), and the `web` package 1.2 or newer (bundled with Quirk:
sessions for login, event streams for live updates). For live updates,
Quirk 7.47.0 (a closed tab no longer stops the server).

## License

MIT
