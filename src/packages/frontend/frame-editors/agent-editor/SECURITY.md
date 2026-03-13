# App Preview Iframe Sandboxing

## Why we cannot trust the iframe

The `.app` agent creates HTML/JS applications that run inside an iframe.
These apps are authored by an AI and may contain arbitrary JavaScript.
A malicious or buggy app must **not** be able to escape the iframe and
act with the logged-in user's frontend privileges (read cookies, access
CoCalc DOM, call CoCalc APIs directly, etc.).

## The sandbox

The preview iframe uses the HTML5 `sandbox` attribute:

```
sandbox="allow-forms allow-scripts allow-presentation"
```

Critically, **`allow-same-origin` is intentionally omitted**. Without it
the iframe runs in an opaque ("null") origin and cannot:

- Access `window.parent`, `window.top`, or the CoCalc DOM
- Read or set cookies/localStorage for the CoCalc origin
- Make credentialed fetch/XHR requests to the CoCalc backend
- Use `document.domain` to relax same-origin checks

If `allow-same-origin` were present alongside `allow-scripts`, any
script inside the iframe could directly manipulate CoCalc's page —
that would be equivalent to XSS.

## The bridge

Because the iframe is fully sandboxed, apps communicate with the CoCalc
project exclusively through a two-way `postMessage` bridge:

- **Bridge SDK** (`cocalc-app-bridge.js`): Injected into the app
  directory; provides `window.cocalc.readFile()`, etc.
- **Bridge host** (`bridge-host.ts`): Runs in the parent frame; listens
  for `cocalc-bridge-request` messages, verifies `event.source` matches
  the iframe, proxies calls to the project, and sends responses back.

The bridge host uses `"*"` as `targetOrigin` when posting responses
because the sandboxed iframe has an opaque origin.  Security is enforced
by the `event.source === iframe.contentWindow` check on incoming
requests — only messages from our specific iframe are processed.

## File access scope

The bridge intentionally allows access to the **entire project
filesystem**, not just the app directory.  The security boundary in
CoCalc is the project container itself — restricting paths within the
project would break legitimate use cases without adding meaningful
security (the user already has full terminal access).
