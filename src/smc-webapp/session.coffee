###
Session management

Initially only the simplest possible client-side implementation.
###

{throttle} = require('underscore')
misc = require('smc-util/misc')
{webapp_client} = require('./webapp_client')

async = require('async')

exports.session_manager = (name, redux) ->
    return new SessionManager(name, redux)

class SessionManager
    constructor: (@name, @redux) ->
        if webapp_client.is_signed_in()
            @init_local_storage()
        else
            webapp_client.once 'signed_in', =>
                @init_local_storage()
        @save = throttle(@save, 1000)

    init_local_storage: =>
        {APP_BASE_URL} = require('misc_page')
        prefix = if APP_BASE_URL then ".#{APP_BASE_URL}" else ''
        @_local_storage_name = "session#{prefix}.#{webapp_client.account_id}.#{@name}"
        @_local_storage_name_closed = "closed-session#{prefix}.#{webapp_client.account_id}.#{@name}"
        @_load_from_local_storage()

        # Wait until projects *and* accounts are
        # defined (loaded from db) before trying to
        # restore open projects and their files.
        # Otherwise things will randomly fail.
        async.series([
            (cb) =>
                @redux.getStore('account').wait
                    until   : (store) -> store.get('editor_settings')?
                    timeout : 0
                    cb      : cb
            (cb) =>
                @redux.getStore('projects').wait
                    until   : (store) -> store.get('project_map')?
                    timeout : 0
                    cb      : cb
        ], (err) =>
            if err
                console.warn("Error restoring session:", err)
            else
                @restore()
            @_initialized = true
        )

    save: =>
        if @_ignore or not @_initialized
            return
        @_state = get_session_state(@redux)
        @_save_to_local_storage()
        return

    # Call this right before closing a project to save its list of open files, so when the
    # file is re-opened they get opened too.
    close_project: (project_id) =>
        if not @_initialized
            return
        open_files = @redux.getProjectStore(project_id).get('open_files_order')?.toJS()
        if not open_files?
            return
        @_state_closed[project_id] = open_files
        @_save_to_local_storage_closed()

    _save_to_local_storage: =>
        if not @_state? or not @_local_storage_name?
            return
        localStorage[@_local_storage_name] = JSON.stringify(@_state)

    _save_to_local_storage_closed: =>
        if not @_state_closed? or not @_local_storage_name?
            return
        localStorage[@_local_storage_name_closed] = JSON.stringify(@_state_closed)

    restore: (project_id) =>
        if project_id?
            @_restore_project(project_id)
        else
            @_restore_all()

    # Call right when you open a project.  It returns all files that should automatically
    # be opened, then removes that list from localStorage.  Returns undefined if nothing known.
    _restore_project: (project_id) =>
        if not @_state_closed? or not @_initialized
            return
        open_files = @_state_closed[project_id]
        delete @_state_closed[project_id]
        if open_files? and not @_ignore
            project = @redux.getProjectActions(project_id)
            for path in open_files
                project.open_file
                    path               : path
                    foreground         : false
                    foreground_project : false

    _restore_all: =>
        if not @_local_storage_name?
            return
        try
            @_ignore = true # don't want to save state **while** restoring it, obviously.
            restore_session_state(@redux, @_state)
        catch err
            console.warn("FAILED to restore state", err)
            @_save_to_local_storage()   # set back to a valid state
        finally
            delete @_ignore
        return

    _load_from_local_storage: =>
        if not @_local_storage_name?
            return

        @_state = []
        @_state_closed = {}

        s = localStorage[@_local_storage_name]
        if s
            try
                @_state = JSON.parse(s)
            catch err
                delete localStorage[@_local_storage_name]
                console.warn(err)

        s = localStorage[@_local_storage_name_closed]
        if s
            try
                @_state_closed = JSON.parse(s)
            catch err
                delete localStorage[@_local_storage_name_closed]
                console.warn(err)

get_session_state = (redux) ->
    state = []
    for project_id in redux.getStore('projects').get('open_projects')?.toJS()
        state.push
            "#{project_id}" : redux.getProjectStore(project_id).get('open_files_order')?.toJS()
    return state

# reset_first is currently not used.  If true, then you get *exactly* the
# saved session; if not set (the default) the current state and the session are merged.
restore_session_state = (redux, state, reset_first=false) ->
    if not state?
        return
    page = redux.getActions('page')

    if reset_first
        for project_id in redux.getStore('projects').get('open_projects')?.toJS() ? []
            page.close_project_tab(project_id)

    projects = redux.getActions('projects')
    for x in state
        for project_id, paths of x
            projects.open_project
                project_id : project_id
                switch_to  : false
            if paths.length > 0
                project = redux.getProjectActions(project_id)
                for path in paths
                    project.open_file
                        path               : path
                        foreground         : false
                        foreground_project : false







