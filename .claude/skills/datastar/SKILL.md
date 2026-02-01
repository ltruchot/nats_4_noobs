---
name: Datastar SSE
description: Hypermedia patterns with Datastar + SSE (UDR 2)
globs:
  - '**/*.templ'
  - '**/static/*.js'
  - '**/handler/*.go'
---

# Datastar + SSE Patterns

Based on UDR 2. Zero build step, ~15KB vanilla JS.

**Official Docs**: <https://data-star.dev>

## The Tao of Datastar (Philosophy)

1. **Backend is source of truth** - Most state lives on the server, frontend is just a view
2. **Use signals sparingly** - Only for user interactions and form bindings
3. **Prefer fetching over assuming** - Don't assume frontend state is current
4. **Use morphing** - Send large DOM chunks, morphing updates only what changed
5. **Use SSE** - Stream 0-n events that patch elements, signals, and execute scripts
6. **Compress responses** - Brotli achieves 200:1 compression on SSE
7. **Use `<a>` for navigation** - Let browsers manage history naturally
8. **CQRS pattern** - Segregate reads (long-lived SSE) from writes (short POST/PUT)
9. **Show loading states** - Use `data-indicator`, wait for backend confirmation
10. **No optimistic lies** - Don't show success until backend confirms

## Signals

Signals are reactive variables denoted with `$` prefix.

```html
<!-- Create signal -->
<div data-signals:count="0"></div>
<div data-signals="{foo: 'bar', nested: {value: 1}}"></div>

<!-- Read signal -->
<span data-text="$count"></span>

<!-- Computed (read-only, auto-updates) -->
<div data-computed:total="$price * $quantity"></div>
```

**Rules:**

- Signals are **global** across the DOM
- Undefined signals default to empty string
- Hyphenated names convert to camelCase: `data-signals:my-value` → `$myValue`
- Nested access: `$form.email`, `$user.profile.name`
- Local signals (prefixed `_`) are NOT sent to backend: `$_localOnly`

## Event Listeners: `data-on`

Syntax: `data-on:<event>__<modifiers>="<expression>"`

```html
<!-- Basic click -->
<button data-on:click="$count++">+1</button>

<!-- With modifiers (double underscore) -->
<input data-on:input__debounce.500ms="@get('/search')" />
<button data-on:click__once="initializeOnce()">Init</button>
<form data-on:submit__prevent="@post('/submit')">
  <!-- Multiple statements (semicolon separated) -->
  <button data-on:click="$loading = true; @post('/action')">Go</button>
</form>
```

**Modifiers:**

- `__debounce.500ms` - Debounce by duration
- `__throttle.100ms` - Throttle by duration
- `__once` - Fire only once
- `__prevent` - preventDefault()
- `__stop` - stopPropagation()
- `__capture` - Use capture phase
- `__passive` - Passive listener
- `__self` - Only if target is the element itself

## Backend Actions

All signals (except `_`-prefixed) are sent automatically with every request.

```html
<!-- GET - signals as query params -->
<button data-on:click="@get('/api/data')">Fetch</button>

<!-- POST/PUT/PATCH/DELETE - signals as JSON body -->
<button data-on:click="@post('/api/submit')">Submit</button>
<button data-on:click="@put('/api/update')">Update</button>
<button data-on:click="@patch('/api/patch')">Patch</button>
<button data-on:click="@delete('/api/remove')">Delete</button>
```

**DO NOT pass signals explicitly - they are sent automatically:**

```html
<!-- WRONG -->
<button data-on:click="@post('/submit', {email: $email})">
  <!-- CORRECT -->
  <button data-on:click="@post('/submit')"></button>
</button>
```

**Filter signals if needed:**

```html
<button data-on:click="@post('/submit', {filterSignals: {include: /^form\./}})"></button>
```

**Options:**

```javascript
@post('/endpoint', {
  contentType: 'json',           // 'json' or 'form'
  filterSignals: {include: /^user/}, // Regex filter
  headers: {'X-Custom': 'value'},
  retry: 'auto',                 // 'auto', 'error', 'always', 'never'
  retryInterval: 1000,
  retryMaxCount: 3
})
```

## Loading Indicators

```html
<button data-on:click="@post('/slow-action')" data-indicator:loading data-attr:disabled="$loading">
  <span data-show="!$loading">Submit</span>
  <span data-show="$loading">Loading...</span>
</button>
```

## Two-Way Binding: `data-bind`

```html
<!-- Text input -->
<input type="text" data-bind:email />

<!-- Textarea -->
<textarea data-bind:message></textarea>

<!-- Select -->
<select data-bind:country>
  <option value="fr">France</option>
  <option value="us">USA</option>
</select>

<!-- Checkbox -->
<input type="checkbox" data-bind:agreed />

<!-- Radio group -->
<input type="radio" name="size" value="S" data-bind:size />
<input type="radio" name="size" value="M" data-bind:size />
<input type="radio" name="size" value="L" data-bind:size />
```

## Conditional Display

```html
<!-- Show/hide (display: none) -->
<div data-show="$isVisible">Visible when true</div>
<div data-show="$items.length > 0">Has items</div>

<!-- Class toggling -->
<div data-class:active="$isActive"></div>
<div data-class:hidden="!$showDetails"></div>
<div data-class="{active: $isActive, disabled: $isDisabled}"></div>

<!-- Attribute binding -->
<button data-attr:disabled="$isLoading"></button>
<a data-attr:href="'/users/' + $userId">Profile</a>
<div data-attr="{'aria-expanded': $isOpen, 'aria-hidden': !$isOpen}"></div>

<!-- Style binding -->
<div data-style:color="$hasError ? 'red' : 'inherit'"></div>
<div data-style="{opacity: $loading ? 0.5 : 1}"></div>
```

## Special Attributes

```html
<!-- Run once on init -->
<div data-init="$count = 0"></div>
<div data-init__delay.500ms="@get('/initial-data')"></div>

<!-- Run on signal changes (effect) -->
<div data-effect="console.log('Count changed:', $count)"></div>

<!-- Element reference -->
<canvas data-ref:myCanvas></canvas>
<script>
  // Access via $myCanvas
</script>

<!-- Intersection observer (infinite scroll, lazy load) -->
<div data-on-intersect="@get('/load-more')">Loading...</div>
<div data-on-intersect__once="$seen = true">Seen once</div>

<!-- Interval -->
<div data-on-interval__duration.1000ms="$seconds++"></div>

<!-- Ignore Datastar processing -->
<div data-ignore>User content here - no Datastar</div>

<!-- Preserve during morph -->
<video data-ignore-morph><!-- Don't reset video --></video>
<details open data-preserve-attr="open"><!-- Keep open state --></details>
```

## SSE Backend (Go + datastar-go)

```go
import (
    datastar "github.com/starfederation/datastar-go"
    "github.com/andybalholm/brotli"
)

func (h *Handler) SSE(w http.ResponseWriter, r *http.Request) {
    sse := datastar.NewSSE(w, r)

    // Enable Brotli compression (200:1 ratio)
    sse.WithCompression(brotli.WriterOptions{
        Quality: 5,  // Balance speed/ratio
        LGWin:   18, // 256KB window
    })

    // Patch HTML elements (morph into DOM)
    sse.PatchElements(`<div id="user-list">...</div>`)

    // Patch signals
    sse.PatchSignals(`{"userCount": 42, "isOnline": true}`)

    // Execute script
    sse.ExecuteScript(`console.log('Hello from server')`)
}
```

**SSE Event Format:**

```text
event: datastar-patch-elements
data: elements <div id="target">New content</div>

event: datastar-patch-signals
data: signals {"count": 42}

event: datastar-execute-script
data: script console.log('executed')
```

## SVG Morphing (for games)

SVG requires namespace specification:

```go
// Option 1: Specify namespace
sse.PatchElementsWithOptions(`<circle id="piece" cx="100" cy="100" r="20"/>`,
    datastar.PatchOptions{Namespace: "svg"})

// Option 2: Wrap in svg tag
sse.PatchElements(`<svg id="board"><circle cx="100" cy="100" r="20"/></svg>`)
```

## Infinite Scroll (chat history)

```html
<div id="messages">
  <!-- Messages here -->
</div>
<div id="load-more" data-on-intersect="@get('/messages/older?before=' + $oldestId)">Loading more...</div>
```

Backend replaces `#load-more` with new messages + new sentinel.

## Rocket Web Components

For reusable, encapsulated components with scoped signals.

```html
<template data-rocket:game-piece data-props:x="int|=0" data-props:y="int|=0" data-props:color="string|='blue'">
  <script>
    // $$ = scoped signal (isolated per instance)
    $$selected = false;

    // $ = global signal (shared)
    // if (!$theme) $theme = 'light'

    // Lifecycle
    effect(() => {
      console.log('Position:', $$x, $$y);
    });

    onCleanup(() => {
      console.log('Piece removed');
    });
  </script>

  <div
    class="piece"
    data-class:selected="$$selected"
    data-on:click="$$selected = !$$selected"
    data-style="{
      left: $$x + 'px',
      top: $$y + 'px',
      backgroundColor: $$color
    }"></div>
</template>

<!-- Usage -->
<game-piece x="100" y="200" color="red"></game-piece>
<game-piece x="150" y="200" color="blue"></game-piece>
```

**Rocket features:**

- `$$` scoped signals (isolated per instance, auto-cleanup)
- `$` global signals (shared across page)
- Props with validation: `data-props:value="int|min:0|max:100|=50"`
- `data-ref:name` creates `$$name` element reference
- `effect()` and `computed()` for reactivity
- `onCleanup()` for lifecycle
- `data-if`/`data-else-if`/`data-else` for conditional rendering
- `data-for="item in $$items"` for loops
- `data-shadow-open`/`data-shadow-closed` for Shadow DOM

## Rocket Template Loading (gods-monorepo)

Rocket templates are declarative HTML `<template>` elements that get converted to web components at runtime.

**Architecture:**

1. Templates are stored in `pkg/gods-ui/lib/widgets/*/` as `.html` files
2. `wc.templ` concatenates all templates into a `data-template` attribute
3. A loader script parses and injects templates into the DOM
4. Rocket processes them into web components

```go
// web/lobby/internal/components/wc/wc.templ
templ Templates() {
    <div id="wc-templates" style="display:none" data-template={ allTemplates() }></div>
    <script src="/static/wc-loader.js"></script>
}
```

**IMPORTANT - templ proxy bug:**

The `templ generate --watch --proxy` mode over-escapes inline `<script>` content, converting:

- `=>` to `=&gt;`
- `"` to `&#34;`
- `'` to `&#39;`

This breaks JavaScript syntax. **Workaround:** Use external `.js` files for loader scripts instead of inline scripts in `.templ` files.

The templates themselves (in `data-template`) are not affected because they're already HTML-escaped as attribute content.

## Signal String Values

**IMPORTANT:** When a signal value is a string literal, wrap it in quotes:

```html
<!-- WRONG - 'toto' is interpreted as variable name -->
<div data-signals:name="toto"></div>

<!-- CORRECT - string literal -->
<div data-signals:name="'toto'"></div>

<!-- CORRECT - empty string -->
<div data-signals:email="''"></div>

<!-- Numbers don't need quotes -->
<div data-signals:count="0"></div>

<!-- Booleans don't need quotes -->
<div data-signals:active="false"></div>
```

This can confuse parsers but is correct Datastar/Rocket syntax.

## Security

1. **Never trust user input** - Escape before rendering
2. **Signals are visible** - Don't put secrets in signals
3. **Users can modify signals** - Validate on backend
4. **CSP requires `unsafe-eval`** - Datastar uses `Function()` constructor:
   ```html
   <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-eval';" />
   ```
5. **Use `data-ignore`** for user-generated content that can't be escaped

## Forms Pattern

```html
<form data-signals="{email: '', password: '', _errors: {}}" data-on:submit__prevent="@post('/auth/login')">
  <input type="email" data-bind:email data-class:error="$_errors.email" />
  <span data-show="$_errors.email" data-text="$_errors.email"></span>

  <input type="password" data-bind:password data-class:error="$_errors.password" />

  <button data-indicator:loading data-attr:disabled="$loading">
    <span data-show="!$loading">Login</span>
    <span data-show="$loading">...</span>
  </button>
</form>
```

## Toaster Pattern (gods-monorepo)

```html
<!-- In layout -->
<body data-signals="{toasts: []}">
  <gods-toaster></gods-toaster>
</body>
```

Backend pushes toasts via SSE:

```go
sse.PatchSignals(`{
  "toasts": [{"id": "1", "type": "success", "message": "Saved!"}]
}`)
```

## Navigation

**Use standard `<a>` elements. No SPA routing.**

```html
<!-- CORRECT -->
<a href="/dashboard">Dashboard</a>

<!-- WRONG - don't do SPA-style navigation -->
<button data-on:click="navigateTo('/dashboard')">Dashboard</button>
```

## Files (gods-monorepo)

- `pkg/gods-ui/lib/vendor/script.js` - Datastar bundle
- `web/lobby/static/datastar.js` - Datastar instance
- `services/gods-api/api/handler/events.go` - SSE handler

## Source

- [Datastar Official Docs](https://data-star.dev)
- [The Tao of Datastar](https://data-star.dev/guide/the_tao_of_datastar)
- [Datastar Reference](https://data-star.dev/reference/attributes)
- [Claude Code Skills - Official Docs](https://code.claude.com/docs/en/skills)
