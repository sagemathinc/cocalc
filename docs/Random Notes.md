- [Coffee-React](https://github.com/jsdf/coffee-react) supports object [destructuring](https://github.com/jsdf/coffee-react#spread-attributes)!

- Check when react [contexts](https://facebook.github.io/react/docs/context.html) gets finalized.

- `salvus_client` is defined by `client_browser.coffee` whose primary export is a Connection class found in `smc-util/client.coffee`

- Remember to read `smc-webapp/dev/README` if starting the server doesn't work

Declarative programming is good assuming the implementation/abstraction is not leaky and what you're declaring is exactly what you want. e.g. It's bad to use map() if you actually care about order even if it turns out that the implementation for map() uses the right order.

### Webapp considerations
Reasons to use a component:
- Separate @state space

Reasons to use an in-class function
- Would be a purely functional component.
 - ie. just renders another component

Salvus Client Calls should be in Actions
- Maintains Actions as a central dispatcher to all state
- UI components should not be concerned with the underlying implementation of their actions.

Processing and interpretation of data should NOT go in Actions. These should either be pure functions (preferred) in a lib or a member of the Component. Actions are reducers or dispatches to the hub.

Prefer to write data processing functions as pure functions outside the member and call them with `@props` from function members inside the Component

### Sync:
Whenever a user makes a change — for some definition of change — a patch is made and sent from the client to the server. The patch contains the change and when the change was made. This way if the user loses connection in the middle of some changes, patches are applied in very nearly always the correct order.

This is always well defined based on this diff-match-patch [library](https://code.google.com/p/google-diff-match-patch/) even when patches are distributed from different computers with varying connections. That is to say, the final application of all patches is consistent.

Mainly found in `smc/src/smc-util/syncstring.coffee`. It builds on `smc/src/smc-util/synctable.coffee`, which provides an interface to PostgreSQL, which supports writing when offline, syncing later, merging, etc.

http://myopensourcestints.blogspot.com/2011/04/create-files-with-leading-dash-in.html