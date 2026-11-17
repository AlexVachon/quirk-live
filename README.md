# live

Interactive web pages written only in Quirk. A page is a **component**:
state in fields, HTML in `render()`, events in `handle()`. It runs on the
server inside a [`web`](https://github.com/AlexVachon/quirk-web) app; a
click, a form or a keystroke goes to it, it re-renders, and the page
updates in place — no reload, and **no JavaScript to write** (a small
fixed script that ships with this package does the browser's part).

```quirk
use web
use live

struct Counter : live.Component {
    count: Int

    define __init(self) -> void {
        super().__init()
        self.count = 0
    }

    define render(self) -> String {
        return live.html("""
<p>{{ count }}</p>
<button q-click="add" q-value="1">+1</button>
<button q-click="add" q-value="-1">−1</button>""", {"count": self.count})
    }

    define handle(self, event: String, data: Map) -> void {
        if event == "add" { self.count = self.count + Int(data["value"]) }
    }
}

app := web.App()
live.page(app, "/", fn(req) { return Counter() })
app.listen(3000)
```

Try the demo — a counter, a todo list with live search, and navigation:
`quirk run examples/demo.qk`, then open http://localhost:3000.

## Components

Subclass `live.Component` and override:

| | |
|---|---|
| `render(self) -> String` | the component's HTML — usually `live.html(template, data)` ([web's template syntax](https://github.com/AlexVachon/quirk-web#templates), escaped) |
| `handle(self, event, data)` | an event from the page; `data` is a Map of Strings |
| `title(self) -> String` | the page title (updated with the page) |

`self.request` is the request that opened the page (`params`, `query`,
cookies). `self.go("/path")` in `handle` sends the browser to another page.

Each visitor gets their own component, kept on the server while they use
the page (`live.session_minutes(n)`, default 30 after the last event).

## Events in templates

| Attribute | Sends | `data` |
|---|---|---|
| `q-click="name"` | on click | `value` from `q-value="..."`, plus any `data-*` attributes |
| `q-submit="name"` (on a form) | on submit | the form's fields by `name` |
| `q-input="name"` | while typing (after a short pause) | `value` |
| `q-change="name"` | on change | `value` (checkboxes: "true" / "false") |
| `q-enter="name"` | on Enter | `value` |

The page is patched, not replaced: the field you're typing in keeps its
focus and text, and unchanged elements stay as they are.

## Pages and navigation

`live.page(app, "/users/:id", fn(req) { return UserPage(req.params["id"]) })`
— patterns as in web routes. Between live pages, links with `q-link`
switch without a reload (`<a href="/users/7" q-link>`), and Back /
Forward work. Pages are ordinary URLs too, so they can be bookmarked and
opened directly.

`live.configure(head="<link rel=\"stylesheet\" href=\"/style.css\">")` adds
to every page's `<head>`; `configure(layout=...)` replaces the page
template (keep `{{ title }}`, `{{ head | raw }}`, `{{ body | raw }}` and
`<script src="/_live/live.js" defer></script>`).

## Testing

`live.TestSession(app)` drives pages without a browser:

```quirk
define test_counter() -> void {
    s := live.TestSession(make_app())
    s.open("/")
    s.send("add", {"value": "1"})
    test.assert_true(s.html.contains("<p>1</p>"))
    s.navigate("/about")
}
```

`tests/browser/` also has a check of the browser script itself, in a real
DOM (Node + jsdom): `cd tests/browser && npm install && node live_dom.mjs http://localhost:3000`
while the demo runs.

## How it works

The page holds `<div q-root="ID">`. The script sends each event as JSON to
`/_live/event`; the server finds the component by its ID (128 random bits),
calls `handle`, renders, and answers with the new HTML, which the script
morphs into the page. `q-link` navigation asks `/_live/nav` for the next
page's component. Every interaction is a round trip, so live suits forms,
dashboards, lists and admin pages; it's not for offline use or animations.

## Requirements

Quirk 7.43.0 or newer, and the `web` package (bundled with Quirk).

## License

MIT
