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
`cd examples/app && quirk run main.qk`, then open http://localhost:3000.

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
| `{% if count >= 10 and not done %} … {% elif … %} … {% else %} … {% end %}` | `== != < > <= >=`, `and or not`, `+ - * / %` |
| `{% for item in items %} … {% else %} … {% end %}` | `else`: the list is empty; `{% for i, item in items %}` with the index (Maps: key, value) |
| `<button @click="save">` | calls `self.save()`; `@click="add(1)"` with arguments (evaluated when shown) |
| `@submit="save"` (a form) | `save(fields)` — a Map of the form's fields |
| `@input="search"` · `@change="pick"` · `@enter="send"` | `search(text)` while typing · on a change · on Enter |
| `<div @after="dismiss" delay="{{ timeout }}">` | `dismiss()` once, `delay` milliseconds after the element appears (`0`: never) |
| `<input model="draft">` | the field shows `self.draft` and sets it as you type (checkboxes: a Bool; `<select model=…>` too) |
| `:disabled="busy"` · `:href="link"` | an attribute from an expression (a Bool adds or leaves it out) |
| `title="Hi {{ name }}"` | `{{ }}` works in attributes |
| `<a href="/todos" q-link>` | go to another page without a reload (Back / Forward work) |

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
| `position="top-right"` | `"top-left"`, `"bottom-right"`, `"bottom-left"`; they stack in their corner |
| `duration=4500` | milliseconds before it closes; `0`: until closed. The timer pauses while the mouse is on it |
| `show_close=true` | the × button |
| `icon=""` | instead of the type's |
| `on_click=fn() {...}` | when it's clicked |
| `on_close=fn() {...}` | when it closes (×, its timer, or `close_notification`) |

`notify` returns the notification's id: `self.close_notification(id)`,
`self.close_notifications()` close them. The look is plain CSS
(`.q-notification`, `.q-notification-success`, `.q-notifications-top-right`,
…) added to every page; override it in your stylesheet.

The counter page in `examples/app` uses every option.

### Transitions, for your own components

What notifications use works for any element of a component:
`q-transition="fade"` gives it the class `fade-enter` when it appears and
`fade-leave` when it goes — it's removed when that animation ends — so the
CSS is

```css
.fade-enter { animation: fade-in .2s; }
.fade-leave { animation: fade-in .2s reverse forwards; }
@keyframes fade-in { from { opacity: 0; } }
```

`q-pause-hover` on an element with `@after` stops its timer while the mouse
is on it.

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
    s.check("Done only")                 // a checkbox, by its label
    s.choose("high")                     // a <select>'s option
    s.submit_form("text", {"text": "eggs"})
    s.run_timers()                       // every @after on the page, now
}
```

`html` is the page's current HTML, `title` its title, `location` its path.

`tests/browser/` checks the browser script itself, in a real DOM (Node +
jsdom): `cd tests/browser && npm install && node live_pages.mjs http://localhost:3000`
while `examples/app` runs.

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
`router.add`), and the `web` package (bundled with Quirk).

## License

MIT
