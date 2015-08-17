###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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

###
FLUX as we use it.

FLUX involves one way flow of data, and *also* CQRS = Command Query Responsibility Segregation.
The CQRS part means for us that:

Actions: these are objects with no state with methods that:

    - Change the state of a system but do *not* return a value.
    - They can impact the state of Stores and/or Tables.

Store: these are objects with state that inform certain components when they change,
and they have methods that:

    - Return a result but do *not* change the observable state of
      the system.  They are free of side effects.


Table: these are synchronized with the backend and emit actions when
they are updated, which in turn modify the store.

###

async = require('async')
flummox = require('flummox')
{Actions} = flummox
misc = require('misc')
{defaults, required} = misc

exports.React = React = require('react')

# TABLE class -- this is our addition to connect the Flux framework to our backend.
# To create a new Table, create a class that derives from Table.  Optionally,
# implement an _change method, which will be called when the Table changes.
# Typically the table will fire off Flux actions from within this method.
# There is a set method below, but *no* exposed get method, since the flow
# of data shoudl be into the Table, then out to the stores via actions
# (and also back and forth with the backend server).   Do not get at the
# underlying Table directly in code.
class Table
    constructor: ->
        if not Primus?  # hack for now -- not running in browser (instead in testing server)
            return
        @_table = require('salvus_client').salvus_client.sync_table(@query(), @options())
        if @_change?
            @_table.on 'change', (keys) =>
                @_change(@_table, keys)

    set: (obj, cb) =>
        @_table.set(obj, cb)

    options: =>  # override in derived class to pass in options to the query -- these only impact initial query, not changefeed!


    # NOTE: it is intentional that there is no get method.  Instead, get data
    # from stores.  The table will set stores (via creating actions) as
    # needed when it changes.


class AppFlux extends flummox.Flux
    constructor: () ->
        @_tables = {}
        super()

    createActions: (name, cls) =>
        #console.log("createActions('#{name})")
        A = super(name, cls)
        A.flux = @
        A.name = name
        return A

    createStore: (name, cls) =>
        # stupid/redundant that flummox requires passing in flux object
        #console.log("createStore('#{name}')")
        S = super(name, cls, @)
        S.flux = @
        S.name = name
        return S

    createTable: (name, table_class) =>
        tables = @_tables
        if tables[name]?
            throw Error("createTable: table #{name} already exists")
        if not table_class?
            throw Error("createTable: second argument must be a class that extends Table")
        table = new table_class()
        if not table instanceof Table
            throw Error("createTable: takes a name and Table class (not object)")
        table.flux = @
        tables[name] = table

    removeTable: (name) =>
        if @_tables[name]?
            @_tables[name]._table.close()
            delete @_tables[name]

    getTable: (name) =>
        if not @_tables[name]?
            throw Error("getTable: table #{name} not registered")
        return @_tables[name]

    getProjectStore: (project_id) =>
        return require('project_store').getStore(project_id, @)

    getProjectActions: (project_id) =>
        return require('project_store').getActions(project_id, @)

    getProjectTable: (project_id, name) =>
        return require('project_store').getTable(project_id, name, @)

class Store extends flummox.Store
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


flux = new AppFlux()

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

COUNT = true
if COUNT
    # Use these in the console:
    #  require('flux').reset_render_count()
    #  JSON.stringify(require('flux').get_render_count())
    render_count = {}
    rclass = (x) ->
        x._render = x.render
        x.render = () ->
            render_count[x.displayName] = (render_count[x.displayName] ? 0) + 1
            return @_render()
        return React.createClass(x)
    exports.get_render_count = ->
        total = 0
        for k,v of render_count
            total += v
        return {counts:render_count, total:total}
    exports.reset_render_count = ->
        render_count = {}
else
    rclass = React.createClass

exports.FluxComponent = FluxComponent
exports.Flux          = Flux
exports.flux          = flux
exports.rtypes        = React.PropTypes
exports.rclass        = rclass
exports.Actions       = Actions
exports.Table         = Table
exports.Store         = Store



