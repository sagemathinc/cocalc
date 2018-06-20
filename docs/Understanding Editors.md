# Editors and Widgets

## Editor
A file editor uses `register` from `project_file.coffee`.
A family of file editors is the set of editors which use the same store.
Each family of editors has its own folder inside `smc-webapp/`.
Inside this folder is typically the following
- main.cjsx
- register.coffee
- actions.coffee
- store.coffee
- README.md

Additional supporting files are also common:
- info.coffee
- styles.coffee
- util.coffee

Treat these folders somewhat like modules.
Typically you will only be importing from `main.cjsx` and `register.coffee`.

## Widget
Widgets stand alone and do not call `register`.
See "smc-webapp/widget-markdown-input/" for an example.

## Actions, Tables, Stores, Oh My!
We use
CQRS = command query responsibility segregation.

It means that you have two different things you communicate with (e.g., "Actions" and "Store"). One is used only for commands (=actions). The other is used only to get out data (=store). Segregation means they are completely separate. It's the design pattern we're using.

If something doesn't fit into that at all, and you don't want to change the store or UI to reflect that, then that something should be somewhere else -- not in actions or store.
CQRS = command query responsibility segregation.

### Stores
- Store functions should always be pure functions

Computed values are
 - Only get called when a component is rendered which depends on the function
 - Callable from outside React code
 - Not stored in the redux state. Maintain redux state as pure data

```ts
{redux, computed, depends, rtypes} = require('app-state-framework')
redux.createStore
    name: 'account'

    # state types without a defined selector default to
    # @get('key_name') from the store
    # Prefer to write store.get('key_name') to be explict
    stateTypes :
        time       : rtypes.string
        user_type  : rtypes.string
        first_name : rtypes.string
        last_name  : rtypes.string
        full_name  : computed rtypes.string
        greetings  : computed rtypes.string

    # Define the dependencies of computed values
    full_name: depends('first_name', 'last_name') ->
        return "#{@first_name} + #{@last_name}"

    # Computed values may call other computed values
    greeting: depends('full_name', 'time') ->
        return "Hello #{@full_name} good #{get_english_time_period_name(@time)}"

# Define private functions outside of the store declaration
get_english_time_period_name: (time_of_day) ->
    # ... some computation

```
Importing them in a high level component:
```coffee
ProjectPage = rclass
    reduxProps:
        account :
            full_name : rtypes.string
            greeting  : rtypes.string

```
Importing values from outside stores
```coffee
redux.createStore
    name: "project_store"

    # Declares what values to import from other stores
    # These are not available using reduxProps but are
    # available as dependencies for computed values
    reduxState:
        account :
            full_name : rtypes.string

    stateTypes:
        shown_greeting : computed rtypes.string

    shown_greeting: depends('full_name') ->
        return "Hello, " + @full_name
```
Run time store definitions can be created as follows:
```coffee
create_project_store_def = (name, project_id) ->
    name: name

    project_id: project_id
```

### Actions
Actions are called to make state changes.
They do not directly manipulate the UI.


## Q and A

* [hsy]> How to change a value in a store? What patterns are preferred?

* [hsy]> What are the steps to make a react component actually "react" to changes in a given store?
  * preparation step:
  * setup step:
  * details to take care of? (e.g. control exactly when to re-render)

The following questions are specific for projects, but are meant to be general:

* not project related, maybe callback, maybe return value, doesn't change store → misc

It depends.  misc is pure javascript and generally just stuff that could be used on both the frontend and backend and doesn't have anything to do with sage_client communication.  It's utility functions.

* project related, maybe callback, no return value, doesn't change store → store ? (e.g. `ensure_directory_exists` ?)

No.  The methods of the store should all be "pure" functions of the immutable js state.  There should be no callbacks ever, and nothing that should have any impact on any state anywhere.    The store is a container of state and the interface is "ways to get at that state".   (Exception: there is a method called "wait", which calls a callback when a certain condition on the store holds.)

* project related, maybe callback, has return value, doesn't change store → somewhere else ?

Somewhere else, e.g,. a module scope function or class or function in client.coffee.   We want to minimize these as much as possible, as they are harder to reason about, but obviously sometimes they are necessary.    Example: synctables involve tons of such methods.

* project related, no callback, no return value, changes store → action

Yes, that's the ideal case.    These can of course be asynchronous functions -- e.g., copying a file -- but rather than expressing what happens as it progresses via callback(s), the instead update the store as the run.   Then the UI can display what happens (or not).

* project related, has callback, no return value, maybe changes store → action, but only for "internal" methods

Yes, to write clean code the non-public api for Actions can have all kinds of such "traditional" methods.

* project related, no callback, has return value, changes store → shouldn't exist at all

Yes, exactly.

Of course, nothing is perfect -- the above is our design pattern, what we should rewrite everything to do, etc., but mistakes have been made.
