
###
The actions -- what you can do with a timer, and also the
underlying synchronized state.
###

misc            = require('smc-util/misc')
{webapp_client} = require('../webapp_client')
{Actions}       = require('../smc-react')


class exports.TimeActions extends Actions

    _init: (project_id, path) =>
        @project_id = project_id
        @path       = path
        # be explicit about exactly what state is in the store
        @setState
            timers : undefined

    init_error: (err) =>
        @setState
            error : err

    _syncdb_change: =>
        @setState
            timers : @syncdb.get()

        if @syncdb.count() == 0
            @add_stopwatch()

    _set: (obj) =>
        @syncdb.set(obj)
        @syncdb.save()  # save to file on disk

    add_stopwatch: =>
        id = 1
        while @syncdb?.get_one(id:id)?
            id += 1
        @_set
            id     : id
            label  : ''
            total  : 0
            state  : 'stopped'  # 'paused', 'running', 'stopped'
            time   : webapp_client.server_time() - 0

    stop_stopwatch: (id) =>
        @_set
            id    : id
            total : 0
            state : 'stopped'
            time  : webapp_client.server_time() - 0

    start_stopwatch: (id) =>
        @_set
            id    : id
            time  : webapp_client.server_time() - 0
            state : 'running'

    pause_stopwatch: (id) =>
        x = @syncdb?.get_one(id:id)
        if not x?
            # stopwatch was deleted
            return
        @_set
            id    : id
            time  : webapp_client.server_time() - 0
            total : x.get('total') + (webapp_client.server_time() - x.get('time'))
            state : 'paused'

    time_travel: =>
        @redux.getProjectActions(@project_id).open_file
            path       : misc.history_path(@path)
            foreground : true

    undo: =>
        @syncdb?.undo()

    redo: =>
        @syncdb?.redo()

