# live

Interactive web pages written only in Quirk. A page is a **struct**: its
state in fields, `on_load()` to set it up, and `build()` returning the
widgets to show. A click or a keystroke runs the widget's handler on the
server, the page is built again, and the browser updates in place — no
reload, and **no JavaScript or HTML to write** (a small fixed script that
ships with this package does the browser's part). It runs inside a
[`web`](https://github.com/AlexVachon/quirk-web) app.

```quirk
use live

struct CounterPage : live.Page {
    count: Int

    define on_load(self) -> void {               // once, when someone opens the page
        self.count = 0
    }

    define build(self) -> live.Widget {          // what the page shows
        return live.Column([
            live.Heading("Counter"),
            live.Label("Count: " + String(self.count)),
            live.Row([
                live.Button("−1", on_click=fn() { self.count = self.count - 1 }),
                PlusButton(self),
            ]),
        ])
    }
}

// A component of your own: a Button with its own on_click.
struct PlusButton : live.Button {
    page: CounterPage

    define __init(self, page: CounterPage) -> void {
        super().__init("+1")
        self.page = page
    }

    define on_click(self) -> void {
        self.page.count = self.page.count + 1
    }
}
```

The routes, in `router.qk`:

```quirk
from live use { Router }
from src.counter use { CounterPage }
from src.todos use { TodoPage }

router = Router()
router.add("/", CounterPage)
router.add("/todos", TodoPage)
```

and the app, in `main.qk`:

```quirk
use web
from router use { router }

define main() -> void {
    app := web.App()
    app.mount("/", router)
    app.listen(3000)
}
```

Try the demo — a counter, a todo list with live search, and navigation, laid
out like this: `cd examples/app && quirk run main.qk`, then open
http://localhost:3000.

## Pages

Subclass `live.Page` and override:

| | |
|---|---|
| `on_load(self)` | set up the page's state — runs once per visitor, before the first build (load from a database or an API here) |
| `build(self) -> live.Widget` | what the page shows; it's built again after every event |
| `title(self) -> String` | the page title (updated with the page) |

In a page, `self.param("id")` reads a `:param` of its path
(`router.add("/users/:id", UserPage)`), `self.query("q")` a `?q=` of its
URL, `self.request` is the whole request, and `self.go("/path")` in a
handler sends the browser to another page.

Each visitor gets their own page object, kept on the server while they use
it (`live.session_minutes(n)`, default 30 after the last event).

## Widgets

Named like the desktop [`ui`](https://github.com/AlexVachon/quirk-ui) widgets.

| Widget | Events |
|---|---|
| `Label(text)` · `Heading(text, level=1)` | |
| `Button(text, on_click=fn() {...})` | `on_click()` |
| `Link(text, href, external=false)` | switches live pages without a reload; Back / Forward work |
| `TextInput(text="", placeholder="", on_change=, on_submit=, password=false)` | `on_change(text)` while typing, `on_submit(text)` on Enter |
| `TextArea(text="", rows=4, on_change=, placeholder="")` | `on_change(text)` |
| `Checkbox(text, checked=false, on_change=)` | `on_change(checked)` |
| `Dropdown(options, selected=0, on_change=)` | `on_change(index, option)` |
| `Slider(min=0, max=100, value=50, on_change=, step=1)` | `on_change(value)` |
| `ListView(items, on_select=)` — items are text or widgets | `on_select(index, item)` |
| `Table(columns, rows, on_select=)` — cells are text or widgets | `on_select(index, row)` |
| `Image(src, alt="")` · `Spacer()` · `Html(source)` | |
| `Column(children, spacing=8)` · `Row(children, spacing=8)` | |

Every event can be handled two ways: pass a function (`on_click=fn() {...}`),
or subclass the widget and override the method (`define on_click(self)`).
Handlers change the page's fields; the page is then built again from them.
So show the page's state in its widgets: `TextInput(self.draft, ...)`, and
`self.draft = ""` in `on_submit` clears the field.

Text is always escaped, so user input can't inject HTML. `with_class("name")`
and `with_style("css")` add a CSS class or inline style (they chain);
`live.configure(head="<link rel=\"stylesheet\" href=\"/style.css\">")` adds
to every page's `<head>`.

### Widgets of your own

Subclass `live.Widget` and return what it's made of from `build()`:

```quirk
struct TodoRow : live.Widget {
    page: TodoPage
    index: Int
    text: String

    define __init(self, page: TodoPage, index: Int, text: String) -> void {
        super().__init()
        self.page = page
        self.index = index
        self.text = text
    }

    define build(self) -> live.Widget {
        return live.Row([
            live.Label(self.text),
            live.Button("×", on_click=fn() { self.page.remove(self.index) }),
        ])
    }
}
```

## The router

`live.Router` is a `web.Router`, so it can hold ordinary routes too
(`router.get("/api/items", handler)`, middleware with `router.use`). Mount it
at "/" — the browser script talks to `/_live/`. `router.add(path, Page)`
takes the page struct itself; a new one is made for each visitor.

## Testing

`live.TestSession(app)` drives pages without a browser:

```quirk
define test_counter() -> void {
    s := live.TestSession(make_app())
    s.open("/")
    s.click("+1")                          // the button labelled "+1"
    test.assert_true(s.html.contains("Count: 1"))
    s.navigate("/todos")
    s.submit("New item", "milk")           // type into the field with that placeholder, press Enter
    s.type("Search", "mi")                 // type (on_change)
    s.check("Show done", false)            // a Checkbox by its text
    s.choose("low", 1)                     // a Dropdown by its first option
}
```

`html` is the page's current HTML, `title` its title, `location` its path.

`tests/browser/` also checks the browser script itself, in a real DOM (Node
+ jsdom): `cd tests/browser && npm install && node live_pages.mjs http://localhost:3000`
while `examples/app` runs (and `live_dom.mjs` against `examples/demo.qk`).

## Templates (the HTML way)

If you'd rather write HTML, a page can be a `live.Component` with a
template instead (or put template output in a page with
`live.Html(live.html(template, data))`):

```quirk
struct Counter : live.Component {
    count: Int

    define __init(self) -> void {
        super().__init()
        self.count = 0
    }

    define render(self) -> String {
        return live.html("""
<p>{{ count }}</p>
<button q-click="add" q-value="1">+1</button>""", {"count": self.count})
    }

    define handle(self, event: String, data: Map) -> void {
        if event == "add" { self.count = self.count + Int(data["value"]) }
    }
}

live.page(app, "/", fn(req) { return Counter() })
```

`live.html(template, data)` uses [web's template
syntax](https://github.com/AlexVachon/quirk-web#templates), escaped. Events
in templates:

| Attribute | Sends | `data` |
|---|---|---|
| `q-click="name"` | on click | `value` from `q-value="..."`, plus any `data-*` attributes |
| `q-submit="name"` (on a form) | on submit | the form's fields by `name` |
| `q-input="name"` | while typing (after a short pause) | `value` |
| `q-change="name"` | on change | `value` (checkboxes: "true" / "false") |
| `q-enter="name"` | on Enter | `value` |
| `<a href="/x" q-link>` | navigates between live pages without a reload | |

`TestSession.send("add", {"value": "1"})` sends a template event in tests.
`configure(layout=...)` replaces the page template (keep `{{ title }}`,
`{{ head | raw }}`, `{{ body | raw }}` and
`<script src="/_live/live.js" defer></script>`).

## How it works

The page holds `<div q-root="ID">`. The script sends each event as JSON to
`/_live/event`; the server finds the page by its ID (128 random bits), runs
the handler, builds and renders the page, and answers with the new HTML,
which the script morphs into the page — the field you're typing in keeps its
focus and text, and unchanged elements stay as they are. Events are sent in
order, and typing that hasn't been sent yet goes before a click. Links ask
`/_live/nav` for the next page. Every interaction is a round trip, so live
suits forms, dashboards, lists and admin pages; it's not for offline use or
animations.

## Requirements

Quirk 7.44.0 or newer (a page struct passed by name to `router.add`), and
the `web` package (bundled with Quirk).

## License

MIT
