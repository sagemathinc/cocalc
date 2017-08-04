###
Session management

Initially only the simplest possible client-side implementation.
###

{throttle} = require('underscore')
misc = require('smc-util/misc')

exports.session_manager = (name, redux) ->
    return new SessionManager(name, redux)

class SessionManager
    constructor: (@name, @redux) ->
        console.log 'session manager', @name
        @_local_storage_name = "session.#{@name}"
        @save = throttle(@save, 1000)

    save: =>
        if @_ignore
            return
        @_state = get_session_state(@redux)
        @_save_to_local_storage()
        return

    _save_to_local_storage: =>
        if not @_state?
            return
        localStorage[@_local_storage_name] = JSON.stringify(@_state)

    restore: =>
        @_load_from_local_storage()
        try
            @_ignore = true # don't want to save state **while** restoring it, obviously.
            restore_session_state(@redux, @_state)
        catch err
            console.warn("FAILED to restore state", err)
        delete @_ignore
        return

    _load_from_local_storage: =>
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







