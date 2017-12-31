###
Session management

Initially only the simplest possible client-side implementation.
###

{throttle} = require('underscore')
misc = require('smc-util/misc')
{webapp_client} = require('./webapp_client')

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

        # Wait until projects is defined (loaded from db) before trying to restore open projects and their files.
        # Otherwise things will randomly fail.
        @redux.getStore('projects').wait
            until   : (store) -> store.get('project_map')?
            timeout : 0
            cb      : =>
                @restore()
                @_initialized = true

    save: =>
        if @_ignore or not @_initialized
            return
        @_state = get_session_state(@redux)
        @_save_to_local_storage()
        return

    _save_to_local_storage: =>
        if not @_state? or not @_local_storage_name?
            return
        localStorage[@_local_storage_name] = JSON.stringify(@_state)

    restore: =>
        if not @_local_storage_name?
            return
        @_load_from_local_storage()
        try
            @_ignore = true # don't want to save state **while** restoring it, obviously.
            restore_session_state(@redux, @_state)
        catch err
            console.warn("FAILED to restore state", err)
        delete @_ignore
        return

    _load_from_local_storage: =>
        if not @_local_storage_name?
            return
        try
            @_state = JSON.parse(localStorage[@_local_storage_name])
        catch
            return


get_session_state = (redux) ->
    state = []
    for project_id in redux.getStore('projects').get('open_projects')?.toJS()
        state.push
            "#{project_id}" : redux.getProjectStore(project_id).get('open_files_order')?.toJS()
    return state

restore_session_state = (redux, state) ->
    if not state?
        return
    page = redux.getActions('page')
    for project_id in redux.getStore('projects').get('open_projects')?.toJS() ? []
        page.close_project_tab(project_id)

    projects = redux.getActions('projects')
    for x in state
        for project_id, paths of x
            projects.open_project(project_id : project_id)
            if paths.length > 0
                project = redux.getProjectActions(project_id)
                for path in paths
                    project.open_file
                        path               : path
                        foreground         : false
                        foreground_project : false







