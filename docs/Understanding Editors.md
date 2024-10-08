# Editors and Widgets

## Editor

A file editor uses `register`.
A family of file editors is the set of editors which use the same store.
Each family of editors has its own folder inside `packages/frontend/`.

Treat these folders somewhat like modules.

## Actions, Tables, Stores, Oh My!

We use
CQRS = command query responsibility segregation.

It means that you have two different things you communicate with \(e.g., "Actions" and "Store"\). One is used only for commands \(=actions\). The other is used only to get out data \(=store\). Segregation means they are separate. It's the design pattern we're using.

If something doesn't fit into that at all, and you don't want to change the store or UI to reflect that, then that something should be somewhere else -- not in actions or store.

### Stores

- Store functions should always be pure functions

Computed values are used in a few places. They were a bad idea and all code that uses them should be rewritten. React hooks solve the same problem in a much better way.

### Actions

Actions are called to make state changes. They do not directly manipulate the UI.

## Q and A


The following questions are specific for projects, but are meant to be general:

- not project related, maybe callback, maybe return value, doesn't change store → misc

It depends. misc is pure javascript and generally just stuff that could be used on both the frontend and backend and doesn't have anything to do with sage_client communication. It's utility functions.

- project related, maybe callback, no return value, doesn't change store → store ? (e.g. `ensure_directory_exists` ?)

No. The methods of the store should all be "pure" functions of the immutable js state. There should be no callbacks ever, and nothing that should have any impact on any state anywhere. The store is a container of state and the interface is "ways to get at that state". (Exception: there is a method called "wait", which calls a callback when a certain condition on the store holds.)

- project related, maybe callback, has return value, doesn't change store → somewhere else ?

Somewhere else, e.g,. a module scope function or class or function in client.coffee. We want to minimize these as much as possible, as they are harder to reason about, but obviously sometimes they are necessary. Example: synctables involve tons of such methods.

- project related, no callback, no return value, changes store → action

Yes, that's the ideal case. These can of course be asynchronous functions -- e.g., copying a file -- but rather than expressing what happens as it progresses via callback(s), the instead update the store as the run. Then the UI can display what happens (or not).

- project related, has callback, no return value, maybe changes store → action, but only for "internal" methods

Yes, to write clean code the non-public api for Actions can have all kinds of such "traditional" methods.

- project related, no callback, has return value, changes store → shouldn't exist at all

Yes, exactly.

Of course, nothing is perfect -- the above is our design pattern, what we should rewrite everything to do, etc., but mistakes have been made.
