###
Question: can we use redux to implement the same API as r.cjsx exports (which was built on Flummox).
###

{EventEmitter} = require('events')

async = require('async')
immutable = require('immutable')
underscore = require('underscore')

React = require('react')

redux_lib = require('redux')
{Provider, connect} = require('react-redux')

misc = require('smc-util/misc')
{defaults, required} = misc

exports.COLOR =
    BG_RED: '#d9534f' # the red bootstrap color of the button background

# We do this so this module can be used without having to include all the
# project-store related functionality.  When it gets loaded, it will set the
# project_store module below.  This is purely a potential lazy loading optimization.
project_store = undefined
exports.register_project_store = (x) -> project_store = x

class Table
    constructor: (@name, @redux) ->
        if not Primus?  # hack for now -- not running in browser (instead in testing server)
            return
        @_table = require('./salvus_client').salvus_client.sync_table(@query(), @options())
        if @_change?
            @_table.on 'change', (keys) =>
                @_change(@_table, keys)

    set: (changes, merge, cb) =>
        @_table.set(changes, merge, cb)

    options: =>  # override in derived class to pass in options to the query -- these only impact initial query, not changefeed!

    # NOTE: it is intentional that there is no get method.  Instead, get data
    # from stores.  The table will set stores (via creating actions) as
    # needed when it changes.

class Actions
    constructor: (@name, @redux) ->
        if not @name?
            throw Error("@name must be defined")
        if not @redux?
            throw Error("@redux must be defined")

    setState : (obj) =>
        @redux._set_state({"#{@name}":obj})
        return

    destroy: =>
        @redux.removeActions(@name)

class Store extends EventEmitter
    constructor: (@name, @redux) ->
        @setMaxListeners(150)

    _handle_store_change: (state) =>
        if state != @_last_state
            @_last_state = state
            @emit('change', state)

    destroy: =>
        @redux.removeStore(@name)

    getState: =>
        return @redux._redux_store.getState().get(@name)

    get: (field) =>
        return @redux._redux_store.getState().getIn([@name, field])

    getIn: (args...) =>
        return @redux._redux_store.getState().getIn([@name].concat(args[0]))

    # wait: for the store to change to a specific state, and when that
    # happens call the given callback.
    wait: (opts) =>
        opts = defaults opts,
            until    : required     # waits until "until(store)" evaluates to something truthy
            throttle : undefined    # in ms -- throttles the call to until(store)
            timeout  : 30           # in seconds -- set to 0 to disable (DANGEROUS since until will get run for a long time)
            cb       : required     # cb(undefined, until(store)) on success and cb('timeout') on failure due to timeout
        if throttle?
            opts.until = underscore.throttle(opts.until, throttle)
        # Do a first check to see if until is already true
        x = opts.until(@)
        if x
            opts.cb(undefined, x)
            return
        # If we want a timeout (the default), setup a timeout
        if opts.timeout
            timeout_error = () =>
                @removeListener('change', listener)
                opts.cb("timeout")
            timeout = setTimeout(timeout_error, opts.timeout*1000)
        # Setup a listener
        listener = () =>
            x = opts.until(@)
            if x
                if timeout
                    clearTimeout(timeout)
                @removeListener('change', listener)
                async.nextTick(=>opts.cb(undefined, x))
        @on('change', listener)

action_set_state = (change) ->
    action =
        type   : 'SET_STATE'
        change : immutable.fromJS(change)   # guaranteed immutable.js all the way down

action_remove_store = (name) ->
    action =
        type : 'REMOVE_STORE'
        name : name

redux_app = (state, action) ->
    if not state?
        return immutable.Map()
    switch action.type
        when 'SET_STATE'
            # Typically action.change has exactly one key, the name of a Store.
            # We merge in what is in action.change[name] to state[name] below.
            action.change.map (val, store) ->
                new_val = state.get(store)?.merge(val) ? val
                state = state.set(store, new_val)
            return state
        when 'REMOVE_STORE'
            return state.delete(action.name)
        else
            return state

class AppRedux
    constructor: () ->
        @_tables = {}
        @_redux_store = redux_lib.createStore(redux_app)
        @_stores  = {}
        @_actions = {}
        @_redux_store.subscribe(@_redux_store_change)

    _redux_store_change: () =>
        state = @_redux_store.getState()
        @_last_state ?= immutable.Map()
        for name, store of @_stores
            s = state.get(name)
            if @_last_state.get(name) != s
                store._handle_store_change(s)

    show_state: () =>
        console.log(JSON.stringify(@_redux_store.getState().toJS()))

    log_states: () =>
        return @_redux_store.subscribe(@show_state)

    _set_state: (change) =>
        #console.log("_set_state", change)
        #for k, v of change
        #    if k == 'undefined'
        #        throw "key must not be undefined"
        @_redux_store.dispatch(action_set_state(change))
        #@show_state()

    createActions: (name, actions_class=Actions) =>
        if not name?
            throw Error("name must be a string")
        return @_actions[name] ?= new actions_class(name, @)

    getActions: (name) =>
        if not name?
            throw Error("name must be a string or an object with a project_id attribute, but is undefined")
        if typeof(name) == 'string'
            return @_actions[name]
        else
            if not name.project_id?
                throw Error("Object must have project_id attribute")
            return project_store?.getActions(name.project_id, @)

    createStore: (name, store_class=Store, init=undefined) =>
        if not name?
            throw Error("name must be a string")
        if not init? and typeof(store_class) != 'function'  # so can do createStore(name, {default init})
            init = store_class
            store_class = Store
        S = @_stores[name]
        if not S?
            S = @_stores[name] = new store_class(name, @)
            # Put into store. WARNING: New set_states CAN OVERWRITE THESE FUNCTIONS
            C = immutable.Map(S)
            C = C.delete('redux') # No circular pointing
            @_set_state({"#{name}":C})
            if init?
                @_set_state({"#{name}":init})
        return S

    getStore: (name) =>
        if not name?
            throw Error("name must be a string")
        return @_stores[name]

    createTable: (name, table_class=Table) =>
        if not name?
            throw Error("name must be a string")
        tables = @_tables
        if tables[name]?
            throw Error("createTable: table #{name} already exists")
        if not table_class?
            throw Error("createTable: second argument must be a class that extends Table")
        table = new table_class(name, @)
        if not table instanceof Table
            throw Error("createTable: takes a name and Table class (not object)")
        return tables[name] = table

    removeTable: (name) =>
        if not name?
            throw Error("name must be a string")
        if @_tables[name]?
            @_tables[name]._table.close()
            delete @_tables[name]

    removeStore: (name) =>
        if not name?
            throw Error("name must be a string")
        if @_stores[name]?
            S = @_stores[name]
            delete @_stores[name]
            S.removeAllListeners()
            @_redux_store.dispatch(action_remove_store(name))

    removeActions: (name) =>
        if not name?
            throw Error("name must be a string")
        if @_actions[name]?
            A = @_actions[name]
            delete @_actions[name]
            A.destroy()

    getTable: (name) =>
        if not name?
            throw Error("name must be a string")
        if not @_tables[name]?
            throw Error("getTable: table #{name} not registered")
        return @_tables[name]

    # getProject[...] only works if the project_store has been
    # initialized by calling register_project_store.  This
    # happens when project_store is require'd.
    getProjectStore: (project_id) =>
        if not misc.is_valid_uuid_string(project_id)
            console.trace()
            console.warn("getProjectStore: INVALID project_id -- #{project_id}")
        return project_store?.getStore(project_id, @)

    getProjectActions: (project_id) =>
        if not misc.is_valid_uuid_string(project_id)
            console.trace()
            console.warn("getProjectActions: INVALID project_id -- #{project_id}")
        return project_store?.getActions(project_id, @)

    getProjectTable: (project_id, name) =>
        if not misc.is_valid_uuid_string(project_id)
            console.trace()
            console.warn("getProjectTable: INVALID project_id -- #{project_id}")
        return project_store?.getTable(project_id, name, @)

    removeProjectReferences: (project_id) =>
        if not misc.is_valid_uuid_string(project_id)
            console.trace()
            console.warn("getProjectReferences: INVALID project_id -- #{project_id}")
        return project_store?.deleteStoreActionsTable(project_id, @)

redux = new AppRedux()

###
Custom Prop Validation
FUTURE: Put prop validation code in a debug area so that it doesn't get loaded for production

In addition to React Prop checks, we implement the following type checkers:
immutable,
immutable.List,
immutable.Map,
immutable.Set,
immutable.Stack,
which may be chained with .isRequired just like normal React prop checks

Additional validations may be added with the following signature
rtypes.custom_checker_name<function (
        props,
        propName,
        componentName,
        location,
        propFullName,
        secret
    ) => <Error-Like-Object or null>
>
Check React lib to see if this has changed.


NOT IMPLEMENTED, FUTURE:
rtypes.immutable.Map.has("jim")
the prop must be an immutable Map and has("jim") must be true
Use a more generic strategy to chain the checks in that case
###

check_is_immutable = (props, propName, componentName="ANONYMOUS", location, propFullName) ->
#    locationName = ReactPropTypeLocationNames[location]
    if not props[propName]? or props[propName].toJS?
        return null
    else
        type = typeof props[propName]
        return new Error(
            "Invalid prop '#{propName}' of" +
            " type #{type} supplied to" +
            " '#{componentName}', expected an immutable collection or frozen object."
        )

allow_isRequired = (validate) ->
    check_type = (isRequired, props, propName, componentName="ANONYMOUS", location) ->
        if not props[propName]? and isRequired
            return new Error("Required prop `#{propName}` was not specified in '#{componentName}'")
        return validate(props, propName, componentName, location)

    chainedCheckType = check_type.bind(null, false)
    chainedCheckType.isRequired = check_type.bind(null, true)
    chainedCheckType.isRequired.category = "IMMUTABLE"
    chainedCheckType.category = "IMMUTABLE"

    return chainedCheckType

create_immutable_type_required_chain = (validate) ->
    check_type = (immutable_type_name, props, propName, componentName="ANONYMOUS") ->
        if immutable_type_name and props[propName]?
            T = immutable_type_name
            if not props[propName].toJS?
                return new Error("NOT EVEN IMMUTABLE, wanted immutable.#{T} #{props}, #{propName}")
            if require('immutable')["#{T}"]["is#{T}"](props[propName])
                return null
            else
                return new Error(
                    "Component '#{componentName}'" +
                    " expected an immutable.#{T}" +
                    " but was supplied #{props[propName]}"
                )
        else
            return validate(props, propName, componentName, location)

    # To add more immutable.js types, mimic code below.
    check_immutable_chain = allow_isRequired check_type.bind(null, undefined)
    check_immutable_chain.Map = allow_isRequired check_type.bind(null, "Map")
    check_immutable_chain.List = allow_isRequired check_type.bind(null, "List")
    check_immutable_chain.Set = allow_isRequired check_type.bind(null, "Set")
    check_immutable_chain.Stack = allow_isRequired check_type.bind(null, "Stack")
    check_immutable_chain.category = "IMMUTABLE"

    return check_immutable_chain

rtypes = {}
rtypes.immutable = create_immutable_type_required_chain(check_is_immutable)
Object.assign(rtypes, React.PropTypes)

###
Tests if the categories are working correctly.
test = () ->
    a = "q"
    if (rtypes.immutable.category != "IMMUTABLE" or
            rtypes.immutable.Map.category != "IMMUTABLE" or
            rtypes.immutable.List.category != "IMMUTABLE" or
            rtypes.immutable.isRequired.category != "IMMUTABLE" or
            rtypes.immutable.Map.isRequired.category != "IMMUTABLE" or
            rtypes.immutable.List.isRequired.category != "IMMUTABLE")
        throw "Immutable checkers are broken"

test()
###

###
Used by Provider to map app state to component props

rclass
    reduxProps:
        store_name :
            prop     : type
###
connect_component = (spec) =>
    map_state_to_props = (state) ->
        props = {}
        if not state?
            return props
        for store_name, info of spec
            for prop, type of info
                s = state.getIn([store_name, prop])
                if type.category == "IMMUTABLE"
                    props[prop] = s
                else
                    props[prop] = if s?.toJS? then s.toJS() else s
        return props
    return connect(map_state_to_props)

###

###
react_component = (x) ->
    if typeof x == 'function'
        # Enhance the return value of x with an HOC
        cached = React.createClass

            # This only caches per Component. No memory leak, but could be faster for multiple components with the same signature
            render : () ->
                @cache ?= {}
                # OPTIMIZATION: check for cached the keys in props
                # currently assumes making a new object is fast enough
                definition = x(@props)
                key = misc.keys(definition.reduxProps).sort().join('')

                if definition.actions?
                    throw Error("You may not define a method named actions in an rclass. This is used to expose redux actions")

                definition.actions = redux.getActions

                @cache[key] ?= rclass(definition) # wait.. is this even the slow part?

                return React.createElement(@cache[key], @props, @props.children)

        return cached

    else
        if x.reduxProps?
            # Inject the propTypes based on the ones injected by reduxProps.
            propTypes = x.propTypes ? {}
            for store_name, info of x.reduxProps
                for prop, type of info
                    if type != rtypes.immutable
                        propTypes[prop] = type
                    else
                        propTypes[prop] = rtypes.object
            x.propTypes = propTypes

        if x.actions? and x.actions != redux.getActions
            throw Error("You may not define a method named actions in an rclass. This is used to expose redux actions")

        x.actions = redux.getActions

        C = React.createClass(x)
        if x.reduxProps?
            # Make the ones comming from redux get automatically injected, as long
            # as this component is in a heierarchy wrapped by <Redux redux={redux}>...</Redux>
            C = connect_component(x.reduxProps)(C)
    return C

COUNT = false
if COUNT
    # Use these in the console:
    #  reset_render_count()
    #  JSON.stringify(get_render_count())
    render_count = {}
    rclass = (x) ->
        x._render = x.render
        x.render = () ->
            render_count[x.displayName] = (render_count[x.displayName] ? 0) + 1
            return @_render()
        return react_component(x)
    window.get_render_count = ->
        total = 0
        for k,v of render_count
            total += v
        return {counts:render_count, total:total}
    window.reset_render_count = ->
        render_count = {}
else
    rclass = react_component

Redux = React.createClass
    propTypes :
        redux : React.PropTypes.object.isRequired
    render: ->
        React.createElement(Provider, {store: @props.redux._redux_store}, @props.children)
        # The lines above are just the non-cjsx version of this:
        #<Provider store={@props.redux._redux_store}>
        #    {@props.children}
        #</Provider>

# Public interface
exports.is_redux = (obj) -> obj instanceof AppRedux
exports.is_redux_actions = (obj) -> obj instanceof Actions

exports.rclass   = rclass    # use rclass instead of React.createClass to get access to reduxProps support
exports.rtypes   = rtypes    # has extra rtypes.immutable, needed for reduxProps to leave value as immutable
exports.React    = React
exports.Redux    = Redux
exports.redux    = redux     # global redux singleton
exports.Actions  = Actions
exports.Table    = Table
exports.Store    = Store
exports.ReactDOM = require('react-dom')

smc?.redux       = redux  # for convenience in the browser (mainly for debugging)

