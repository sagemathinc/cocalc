##############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015 -- 2016, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################
# SMC specific wrapper around the redux library
#
# Question: can we use redux to implement the same API as r.cjsx exports (which was built on Flummox).
###############################################################################

{EventEmitter}   = require('events')
async            = require('async')
immutable        = require('immutable')
underscore       = require('underscore')
React            = require('react')
redux_lib        = require('redux')
{createSelector} = require('reselect')


{Provider, connect}  = require('react-redux')
misc                 = require('smc-util/misc')
{defaults, required} = misc

exports.COLOR =
    BG_RED  : '#d9534f' # the red bootstrap color of the button background
    FG_RED  : '#c9302c' # red used for text
    FG_BLUE : '#428bca' # blue used for text

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

    setState: (obj) =>
        @redux._set_state({"#{@name}":obj})
        return

    destroy: =>
        @redux.removeActions(@name)
###
store_def =
    reduxState:
        account:
            full_name : computed rtypes.string

    # Values not defined in stateTypes are not accessible as properties
    # They are also not available through reduxProps
    stateTypes:
        basic_input         : rtypes.string
        displayed_cc_number : rtypes.string
        some_list           : rtypes.immutable.List
        filtered_val        : computed rtypes.immutable.List

    displayed_cc_number: ->
        return @getIn(['project_map', 'users', 'cc'])

    filtered_val: depends('basic_input', 'some_list') ->
        return @some_list.filter (val) => val == @basic_input

    # Not available through redux props.
    # Great place to describe pure functions
    # These are callable in your selectors as @greetings(...)
    greetings: (full_name) -> ...

Note: you cannot name a property "state" or "props"
###
class Store extends EventEmitter
    # TODOJ: remove @name when fully switched over
    constructor: (@name, @redux, store_def) ->
        @setMaxListeners(150)
        if not store_def?
            return
        import_functions = harvest_import_functions(store_def)
        own_functions    = harvest_own_functions(store_def)
        Object.assign(@, store_def)

        # Bind all functions to this scope.
        # For example, they importantly get access to @redux, @get, and @getIn
        [b_own_functions, b_import_functions] = misc.bind_objects(@, [own_functions, import_functions])
        selectors = generate_selectors(b_own_functions, b_import_functions)

        # Bind selectors as properties on this store
        prop_map = {}
        underscore.map selectors, (selector, name) =>
            prop_map[name] =
                get        : -> selector(@getState())
                enumerable : true

        Object.defineProperties(@, prop_map)


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
            until       : required     # waits until "until(store)" evaluates to something truthy
            throttle_ms : undefined    # in ms -- throttles the call to until(store)
            timeout     : 30           # in seconds -- set to 0 to disable (DANGEROUS since until will get run for a long time)
            cb          : required     # cb(undefined, until(store)) on success and cb('timeout') on failure due to timeout
        if opts.throttle_ms?
            opts.until = underscore.throttle(opts.until, opts.throttle_ms)
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

# Parses and removes store_def.reduxState
# Returns getters for data from other stores
harvest_import_functions = (store_def) ->
    result = {}
    for store_name, values of store_def.reduxState
        for prop_name, type of values
            result[prop_name] = () ->
                store = @redux.getStore(store_name)
                if store.__converted?
                    val = store[prop]
                else # TODOJ: remove when all stores are converted
                    val = store.get(prop_name)
                    val ?= store[prop]?()
                return val
    delete store_def.reduxState
    return result

# Parses and removes store_def.stateTypes
# Also removes store_def[func] where func
# is a key in store_def.stateTypes
# Returns functions for selectors
harvest_own_functions = (store_def) ->
    functions = {}
    underscore.map store_def.stateTypes, (type, prop_name) =>
        # No defined selector, but described in state
        if not store_def[prop_name]
            if type.is_computed
                throw "Computed value '#{prop_name}' in store '#{store_def.name}' was declared but no definition was found."
            functions[prop_name] = () -> @get(prop_name)
        else
            functions[prop_name] = store_def[prop_name]
            delete store_def[prop_name]
    delete store_def.stateTypes
    return functions

# Generates selectors based on functions found in `own` and `import_functions`
# Replaces and returns functions in `own` with appropriate selectors.
generate_selectors = (own, import_functions) ->
    all_selectors = Object.assign(own, import_functions)
    DAG = misc.create_dependency_graph(all_selectors)
    ordered_funcs = misc.top_sort(DAG, omit_sources:true)
    # import_functions contains only sources so all funcs will be in own
    for func_name in ordered_funcs
        selector = createSelector (all_selectors[dep_name] for dep_name in DAG[func_name]), own[func_name]
        own[func_name] = selector
        all_selectors[func_name] = selector
    return own

depends  = (dependency_names...) ->
    return (deriving_func) =>
        deriving_func.dependency_names = dependency_names
        return deriving_func

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

    createStore: (spec, store_class=Store, init=undefined) =>
        # Old method
        if typeof spec == 'string'
            name = spec
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
        else
            # New method
            if not spec.name?
                throw Error("name must be a string")

            init = spec.getInitialState?()
            delete spec.getInitialState

            S = @_stores[spec.name]
            if not S?
                    S = @_stores[spec.name] = new Store(spec.name, @, spec)
                    # TODOJ: REMOVE
                    S.__converted = true
                if init?
                    @_set_state({"#{spec.name}":init})
                S._init?()
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
                    " expected #{propName} to be an immutable.#{T}" +
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

computed = (rtype) =>
    clone = rtype.bind({})
    clone.is_computed = true
    return clone

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
                if redux.getStore(store_name).__converted?
                    val = redux.getStore(store_name)[prop]
                else # TODOJ: remove when all stores are converted
                    val = state.getIn([store_name, prop])
                if type.category == "IMMUTABLE"
                    props[prop] = val
                else
                    props[prop] = if val?.toJS? then val.toJS() else val
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
TIME = false
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
else if TIME
    rclass = (x) =>
        t0 = performance.now()
        r = react_component(x)
        t1 = performance.now()
        if t1 - t0 > 1
            console.log r.displayName, "took", t1 - t0, "ms of time"
        return r
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

# Canonical name to use for Redux store associated to a given project/path.
# TODO: this code is also in many editors -- make them all just use this.
exports.redux_name = (project_id, path) -> "editor-#{project_id}-#{path}"


exports.rclass   = rclass    # use rclass instead of React.createClass to get access to reduxProps support
exports.rtypes   = rtypes    # has extra rtypes.immutable, needed for reduxProps to leave value as immutable
exports.computed = computed
exports.depends  = depends
exports.React    = React
exports.Redux    = Redux
exports.redux    = redux     # global redux singleton
exports.Actions  = Actions
exports.Table    = Table
exports.Store    = Store
exports.ReactDOM = require('react-dom')

if DEBUG
    smc?.redux = redux  # for convenience in the browser (mainly for debugging)
    exports._internals =
        AppRedux                 : AppRedux
        harvest_import_functions : harvest_import_functions
        harvest_own_functions    : harvest_own_functions
        generate_selectors       : generate_selectors
        connect_component        : connect_component
        react_component          : react_component





