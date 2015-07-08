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

misc = require('misc')

{defaults, required} = misc

{Actions, Store, Table}  = require('flux')

QUERIES =
    project_log :
        project_id : null
        account_id : null
        time       : null
        event      : null

must_define = (flux) ->
    if not flux?
        throw "you must explicitly pass a flux object into each function in project_store"

# Define user actions
key = (project_id, name) -> "project-#{project_id}-#{name}"

exports.getStore = getStore = (project_id, flux) ->
    must_define(flux)
    name = key(project_id, '')
    store = flux.getStore(name)
    if store?
        return store

    class ProjectActions extends Actions

        setTo: (payload) -> payload

        _project: ->
            return require('project').project_page(project_id:project_id)

        # report a log event to the backend -- will indirectly result in a new entry in the store...
        log: (event) ->
            require('salvus_client').salvus_client.query
                query :
                    project_log :
                        project_id : project_id
                        time       : new Date()
                        event      : event
                cb : (err) ->
                    if err
                        # TODO: what do we want to do if a log doesn't get recorded?
                        console.log("error recording a log entry: ", err)

        open_file: (opts) ->
            opts = defaults opts,
                path       : required
                foreground : true      # display in foreground as soon as possible
            # TEMPORARY -- later this will happen as a side effect of changing the store!
            @_project().open_file(path:opts.path, foreground:opts.foreground)

        open_settings: ->
            # TODO: temporary -- later the displayed tab will be stored in the store *and* that will
            # influence what is displayed
            @_project().display_tab('project-settings')

    class ProjectStore extends Store
        constructor: (flux) ->
            super()
            ActionIds = flux.getActionIds(name)
            @register(ActionIds.setTo, @setTo)
            @state = {}

        setTo: (payload) ->
            @setState(payload)

    actions    = flux.createActions(name, ProjectActions)
    store      = flux.createStore(name, ProjectStore, flux)
    store.name = name
    queries    = misc.deep_copy(QUERIES)

    create_table = (table_name) ->
        q = queries[table_name]
        class P extends Table
            query: ->
                return "#{table_name}":q
            _change: (table, keys) =>
                actions.setTo("#{table_name}": table.get())

    for table, q of queries
        q.project_id = project_id
        flux.createTable(key(project_id, table), create_table(table))

    return store

exports.getActions = (project_id, flux) ->
    must_define(flux)
    if not getStore(project_id, flux)?
        getStore(project_id, flux)
    return flux.getActions(key(project_id,''))

exports.getTable = (project_id, name, flux) ->
    must_define(flux)
    if not getStore(project_id, flux)?
        getStore(project_id, flux)
    return flux.getTable(key(project_id, name))

exports.deleteStoreActionsTable = (project_id, flux) ->
    must_define(flux)
    name = key(project_id, '')
    flux.removeStore(name)
    flux.removeActions(name)
    flux.removeAllListeners(name)
    for table,_ of QUERIES
        flux.removeTable(key(project_id, table))
