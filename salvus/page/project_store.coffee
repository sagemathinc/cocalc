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
underscore = require('underscore')
async = require('async')
immutable  = require('immutable')
{salvus_client} = require('salvus_client')
{alert_message} = require('alerts')
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

        setTo: (payload) =>
            payload

        _project: =>
            return require('project').project_page(project_id:project_id)

        _ensure_project_is_open: (cb) =>
            s = flux.getStore('projects')
            if not s.is_project_open(project_id)
                flux.getActions('projects').open_project(project_id:project_id)
                s.wait_until_project_is_open(project_id, 30, cb)
            else
                cb()

        set_error: (error) =>
            if error == ''
                @setTo(error:error)
            else
                @setTo(error:((store.state.error ? '') + '\n' + error).trim())

        set_activity: (opts) =>
            opts = defaults opts,
                id   : undefined
                desc : undefined
            if not opts.id? and not opts.desc?
                return
            if not opts.id?
                @_activity_id = (@_activity_id ? 0) + 1
                opts.id = @_activity_id
            x = store.get_activity()
            if not x?
                x = {}
            if not opts.desc?
                delete x[opts.id]
            else
                x[opts.id] = opts.desc
            @setTo(activity: x)
            return opts.id

        clear_activity: (id) =>
            if id?
                @set_activity(id:id)  # clears for this id
            else
                @setTo(activity:{})

        # report a log event to the backend -- will indirectly result in a new entry in the store...
        log: (event) =>
            require('salvus_client').salvus_client.query
                query :
                    project_log :
                        project_id : project_id
                        time       : new Date()
                        event      : event
                cb : (err) =>
                    if err
                        # TODO: what do we want to do if a log doesn't get recorded?
                        console.log("error recording a log entry: ", err)

        open_file: (opts) =>
            opts = defaults opts,
                path       : required
                foreground : true      # display in foreground as soon as possible
                chat       : false
            @_ensure_project_is_open (err) =>
                if err
                    # TODO!
                    console.log("error opening file in project: ", err, project_id, path)
                else
                    # TEMPORARY -- later this will happen as a side effect of changing the store...
                    @_project().open_file(path:opts.path, foreground:opts.foreground)
                    if opts.chat
                        console.log("opts.chat = ", opts.chat)
                        @_project().show_editor_chat_window(opts.path)

        foreground_project: =>
            @_ensure_project_is_open (err) =>
                if err
                    # TODO!
                    console.log("error putting project in the foreground: ", err, project_id, path)
                else
                    flux.getActions('projects').foreground_project(project_id)

        open_directory: (path) =>
            @_ensure_project_is_open (err) =>
                if err
                    # TODO!
                    console.log("error opening directory in project: ", err, project_id, path)
                else
                    @foreground_project()
                    @set_current_path(path)
                    @set_focused_page('project-file-listing')

        set_focused_page: (page)=>
            # TODO: temporary -- later the displayed tab will be stored in the store *and* that will
            # influence what is displayed
            @_project().display_tab(page)

        set_current_path: (path)=>
            # Set the current path for this project. path is either a string or array of segments.
            p = @_project()
            v = p._parse_path(path)
            if not underscore.isEqual(path, p.current_path)
                p.current_path = v
                @setTo(current_path: v[..])
                @set_directory_files(v)
                p.update_file_list_tab(true)
                @clear_all_checked_files()

        set_directory_files: (path, sort_by_time, show_hidden) ->
            path ?= (store.state.current_path ? [])
            sort_by_time ?= (store.state.sort_by_time ? true)
            show_hidden  ?= (store.state.show_hidden ? false)
            require('salvus_client').salvus_client.project_directory_listing
                project_id : project_id
                path       : path.join("/")
                time       : sort_by_time
                hidden     : show_hidden
                timeout    : 10
                cb         : (err, listing) =>
                    if not store.state.directory_file_listing?
                        map = immutable.Map()
                    else
                        map = store.state.directory_file_listing
                    if err
                        map = map.set(path.join("/"), err)
                    else
                        map = map.set(path.join("/"), listing.files)
                        @setTo(checked_files : store.state.checked_files.intersect(file.name for file in listing.files))
                    @setTo(directory_file_listing : map)

        set_file_checked : (file, checked) ->
            if checked
                checked_files = store.state.checked_files.add(file)
            else
                checked_files = store.state.checked_files.delete(file)

            @setTo(checked_files : checked_files, file_action : undefined)

        set_all_checked_files : (file_list) ->
            @setTo(checked_files : store.state.checked_files.union(file_list))

        clear_all_checked_files : ->
            @setTo(checked_files : store.state.checked_files.clear(), file_action : undefined)

        set_file_action : (action) ->
            @setTo(file_action : action)

        ensure_directory_exists: (opts)=>
            #Temporary: call from project page
            @_project().ensure_directory_exists(opts)

        get_from_web: (opts)=>
            #Temporary: call from project page
            @_project().get_from_web(opts)

        create_editor_tab: (opts) =>
            @_project().editor.create_tab(opts)

        display_editor_tab: (opts) =>
            @_project().editor.display_tab(opts)

        zip_files : (opts) ->
            opts = defaults opts,
                src     : required
                dest    : required
                zip_args: undefined
                path    : undefined   # default to root of project
                cb      : undefined   # cb(true or false)
            if opts.zip_args?
                args = opts.zip-args
            else
                args = []
            args = args.concat(['-r'], [opts.dest], opts.src)
            salvus_client.exec
                project_id      : project_id
                command         : 'zip'
                args            : args
                timeout         : 50
                network_timeout : 60
                err_on_exit     : true    # this should fail if exit_code != 0
                path            : opts.path
                cb              : (err, output) =>
                    console.log(err, output)
                    opts.cb?(err)

        copy_files : (opts) ->
            opts = defaults opts,
                src     : required
                dest    : required
            args = ['-rltgoDxH', '--backup', '--backup-dir=.trash/', opts.src, opts.dest]
            salvus_client.exec
                project_id : project_id
                command    : 'rsync'  # don't use "a" option to rsync, since on snapshots results in destroying project access!
                args       : args
                timeout    : 120   # how long rsync runs on client
                network_timeout : 120   # how long network call has until it must return something or get total error.
                err_on_exit: true
                path       : '.'
                cb         : (err, output) =>
                    if err
                        alert_message(type:"error", message:"Error copying #{opts.src} to #{opts.dest} -- #{err}")
                    else
                        alert_message(type:"success", message:"Successfully copied #{opts.src} to #{opts.dest}")

        move_files : (opts) ->
            opts = defaults opts,
                src     : required
                dest    : required
                path    : undefined   # default to root of project
                cb      : undefined   # cb(true or false)
                mv_args : undefined
                alert   : true        # show alerts
            if opts.mv_args?
                args = opts.mv_args
            else
                args = []
            args = args.concat(['--'], opts.src, [opts.dest])
            salvus_client.exec
                project_id      : project_id
                command         : 'mv'
                args            : args
                timeout         : 15  # move should be fast..., unless across file systems.
                network_timeout : 20
                err_on_exit     : true    # this should fail if exit_code != 0
                path            : opts.path
                cb              : (err, output) =>
                    if opts.alert
                        if err
                            alert_message(type:"error", message:"Error while moving '#{opts.src}' to '#{opts.dest}' -- #{err}")
                        else if output.event == 'error'
                            alert_message(type:"error", message:"Error moving '#{opts.src}' to '#{opts.dest}' -- #{output.error}")
                        #else if output.exit_code != 0
                        #    alert_message(type:"error", message:"Error moving '#{opts.src}' to '#{opts.dest}' -- exit_code: #{output.exit_code}")
                        else
                            alert_message(type:"info", message:"Moved '#{opts.src}' to '#{opts.dest}'")
                    opts.cb?(err or output.event == 'error') # or output.exit_code != 0)

        xxx_trash_files: (opts) ->
            opts = defaults opts,
                src  : required
                path : undefined
                cb   : undefined
            async.series([
                (cb) =>
                    @ensure_directory_exists(path:'.trash', cb:cb)
                (cb) =>
                    @move_files(src:opts.src, path:opts.path, dest:'.trash', cb:cb, alert:false, mv_args:['--backup=numbered'])
            ], (err) =>
                err = 'i know how to get an error'
                opts.cb?(err)
                @set_directory_files()   # TODO: not solid since you may have changed directories. -- won't matter when we have push events for the file system, and if you have moved to another directory then you don't care about this directory anyways.
            )

        trash_files: (opts) ->
            opts = defaults opts,
                src  : required
                path : undefined
            id = @set_activity(desc: "trashing #{misc.to_json(opts.src)}")
            async.series([
                (cb) =>
                    @ensure_directory_exists(path:'.trash', cb:cb)
                (cb) =>
                    @move_files(src:opts.src, path:opts.path, dest:'.trash', cb:cb, alert:false, mv_args:['--backup=numbered'])
            ], (err) =>
                if err
                    @set_error("problem trashing #{misc.to_json(opts.src)} -- #{err}")
                    @log({event:"miniterm", input:"failed to trash some files -- #{err}"})
                else
                    @log({event:"miniterm", input:"successfully trashed some files -- #{misc.to_json(opts.src)}"})
                @clear_activity(id)
                @set_directory_files()   # TODO: not solid since you may have changed directories. -- won't matter when we have push events for the file system, and if you have moved to another directory then you don't care about this directory anyways.
            )

        download_file : (opts) ->
            @_project().download_file(opts)

    class ProjectStore extends Store
        constructor: (flux) ->
            super()
            ActionIds = flux.getActionIds(name)
            @register(ActionIds.setTo, @setTo)
            @state =
                current_path  : []
                sort_by_time  : true #TODO
                show_hidden   : false
                checked_files : immutable.Set()

        setTo: (payload) ->
            @setState(payload)

        get_activity: => @state.activity


    actions    = flux.createActions(name, ProjectActions)
    store      = flux.createStore(name, ProjectStore, flux)
    store.name = name
    queries    = misc.deep_copy(QUERIES)

    create_table = (table_name, q) ->
        class P extends Table
            query: =>
                return "#{table_name}":q.query
            options: =>
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
