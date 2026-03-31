# App Preview Iframe Sandboxing

## Why we cannot fully trust the iframe

The `.app` agent creates HTML/JS applications that run inside an iframe.
These apps are authored by an AI and may contain arbitrary JavaScript.
Ideally the iframe must **not** be able to escape and act with the
logged-in user's frontend privileges (read cookies, access CoCalc DOM,
call CoCalc APIs directly, etc.).

## Current sandbox

The preview iframe uses the HTML5 `sandbox` attribute:

```
sandbox="allow-forms allow-scripts allow-presentation allow-same-origin"
```

**`allow-same-origin` is currently required** because the iframe loads
resources (CSS, images, JS files) from the same CoCalc file server.
Without it, the browser assigns an opaque ("null") origin and blocks
all subresource loads, making the app non-functional.

### Known limitation

With `allow-scripts` **and** `allow-same-origin` together, any script
inside the iframe could in principle access `window.parent`, read
cookies, or call CoCalc APIs — equivalent to XSS. This is mitigated
by the fact that:

- The app code is AI-generated and visible to the user
- The security boundary in CoCalc is the project container itself
- The user already has full terminal/file access in the project

### Planned fix

Serve iframe content from a **different subdomain** (e.g.
`apps.cocalc.com` vs `cocalc.com`). With a different origin,
`allow-same-origin` restores the iframe's *own* origin without
granting access to the parent page — making it safe alongside
`allow-scripts`.

## The bridge

Apps communicate with the CoCalc project through a two-way
`postMessage` bridge:

- **Bridge SDK** (`cocalc-app-bridge.js`): Injected into the app
  directory; provides `window.cocalc.readFile()`, etc.
- **Bridge host** (`bridge-host.ts`): Runs in the parent frame; listens
  for `cocalc-bridge-request` messages, verifies `event.source` matches
  the iframe and `event.origin` matches the expected origin, proxies
  calls to the project, and sends responses back.

## File access scope

The bridge intentionally allows access to the **entire project
filesystem**, not just the app directory.  The security boundary in
CoCalc is the project container itself — restricting paths within the
project would break legitimate use cases without adding meaningful
security (the user already has full terminal access).
