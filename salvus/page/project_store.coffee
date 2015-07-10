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


# At most this many of the most recent log messages for a project get loaded:
MAX_PROJECT_LOG_ENTRIES = 5000

misc = require('misc')

{defaults, required} = misc

{Actions, Store, Table}  = require('flux')



QUERIES =
    project_log :
        query :
            project_id : null
            account_id : null
            time       : null  # if we wanted to only include last month.... time       : -> {">=":misc.days_ago(30)}
            event      : null
        options : [{order_by:'-time'}, {limit:MAX_PROJECT_LOG_ENTRIES}]

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

        setTo: (payload) ->
            payload

        _project: ->
            if not @_project_cache?
                @_project_cache = require('project').project_page(project_id:project_id)
            return @_project_cache

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

        set_current_path: (path) ->
            # Set the current path for this project. path is either a string or array of segments.
            p = @_project()
            v = p._parse_path(path)
            p.current_path = v
            @setTo(current_path: v[..])
            p.update_file_list_tab(true)

    class ProjectStore extends Store
        constructor: (flux) ->
            super()
            ActionIds = flux.getActionIds(name)
            @register(ActionIds.setTo, @setTo)
            @state = {current_path:[]}

        setTo: (payload) ->
            @setState(payload)

    actions    = flux.createActions(name, ProjectActions)
    store      = flux.createStore(name, ProjectStore, flux)
    store.name = name
    queries    = misc.deep_copy(QUERIES)

    create_table = (table_name, q) ->
        class P extends Table
            query: ->
                return "#{table_name}":q.query
            options: ->
                return q.options
            _change: (table, keys) =>
                actions.setTo("#{table_name}": table.get())

    for table_name, q of queries
        for k, v of q
            if typeof(v) == 'function'
                q[k] = v()
        q.query.project_id = project_id
        T = flux.createTable(key(project_id, table_name), create_table(table_name, q))

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
