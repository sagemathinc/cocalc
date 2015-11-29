###
Question: can we use redux to implement the same API as r.cjsx exports (which was built on Flummox).
###

async = require('async')
misc = require('smc-util/misc')
{defaults, required} = misc

exports.React = React = require('react')
exports.ReactDOM = ReactDOM = require('react-dom')

# WE do this so this flux module can be used without having to include all the
# project-store related functionality.  When it gets loaded, it will set the
# project_store module below.
project_store = undefined
exports.register_project_store = (x) -> project_store = x

class Table
    constructor: ->
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
    constructor: (@name, @cls, @app) ->
        @flux = @app # for backward compatibility temporarily

class Store
    constructor: (@name, @cls, @app) ->
        @flux = @app # for backward compatibility temporarily

    # wait: for the store to change to a specific state, and when that
    # happens call the given callback.
    wait: (opts) =>
        opts = defaults opts,
            until   : required     # waits until "until(store)" evaluates to something truthy
            timeout : 30           # in seconds -- set to 0 to disable (DANGEROUS since until will get run for a long time)
            cb      : required     # cb(undefined, until(store)) on success and cb('timeout') on failure due to timeout
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

class AppRedux
    constructor: () ->
        @_tables = {}
        #super()

    createActions: (name, cls) =>
        return new Actions(name, cls, @)

    createStore: (name, cls) =>
        return super(name, cls, @)

    createTable: (name, table_class) =>
        tables = @_tables
        if tables[name]?
            throw Error("createTable: table #{name} already exists")
        if not table_class?
            throw Error("createTable: second argument must be a class that extends Table")
        table = new table_class()
        if not table instanceof Table
            throw Error("createTable: takes a name and Table class (not object)")
        table.redux = @
        table.flux = @  # TODO: for temporary compatibility
        tables[name] = table

    removeTable: (name) =>
        if @_tables[name]?
            @_tables[name]._table.close()
            delete @_tables[name]

    getTable: (name) =>
        if not @_tables[name]?
            throw Error("getTable: table #{name} not registered")
        return @_tables[name]

    # getProject[...] only works if the project_store has been
    # initialized by calling register_project_store.  This
    # happens when project_store is require'd.
    getProjectStore: (project_id) =>
        return project_store?.getStore(project_id, @)

    getProjectActions: (project_id) =>
        return project_store?.getActions(project_id, @)

    getProjectTable: (project_id, name) =>
        return project_store?.getTable(project_id, name, @)

redux = new AppRedux()
flux  = redux # TODO for compat temporarily

if smc?
    smc.redux = redux  # for convenience in the browser (mainly for debugging)

FluxComponent = require('flummox/component')

Flux = React.createClass
    propTypes :
        flux       : React.PropTypes.object.isRequired
        connect_to : React.PropTypes.object.isRequired
    render: ->
        store_props = {}
        for prop, store_name of @props.connect_to
            x = store_props[store_name]
            if not x?
                x = store_props[store_name] = []
            x.push(prop)
        store_map = {}
        f = (store_name) ->
            store_map[store_name] = (the_store) ->
                return misc.dict([prop, the_store.state[prop]] for prop in store_props[store_name])
        for store_name in misc.keys(store_props)
            f(store_name)
        <FluxComponent flux={@props.flux} connectToStores={store_map}>
            {@props.children}
        </FluxComponent>

COUNT = false
if COUNT
    # Use these in the console:
    #  require('./r').reset_render_count()
    #  JSON.stringify(require('./r').get_render_count())
    render_count = {}
    rclass = (x) ->
        x._render = x.render
        x.render = () ->
            render_count[x.displayName] = (render_count[x.displayName] ? 0) + 1
            return @_render()
        return React.createClass(x)
    window.get_render_count = ->
        total = 0
        for k,v of render_count
            total += v
        return {counts:render_count, total:total}
    window.reset_render_count = ->
        render_count = {}
else
    rclass = React.createClass

exports.is_flux = (obj) ->
    return obj instanceof AppFlux

exports.is_flux_actions = (obj) ->
    return obj instanceof Actions

exports.FluxComponent = FluxComponent
exports.Flux          = Flux
exports.flux          = flux
exports.rtypes        = React.PropTypes
exports.rclass        = rclass
exports.Actions       = Actions
exports.Table         = Table
exports.Store         = Store