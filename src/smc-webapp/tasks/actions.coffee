###
Task Actions
###

immutable = require('immutable')

{Actions}  = require('../smc-react')

misc = require('smc-util/misc')

class exports.TaskActions extends Actions
    _init: (project_id, path, syncdb, store, client) =>
        @syncdb = syncdb
        @store  = store
        @syncdb.on('change', @_syncdb_change)

    _syncdb_change: (changes) =>
        tasks = @store.get('tasks') ? immutable.Map()
        changes.forEach (x) =>
            task_id = x.get('task_id')
            t = @syncdb.get_one(x)
            if not t?
                # deleted
                tasks = tasks.delete(task_id)
            else
                # changed
                tasks = tasks.set(task_id, t)

        v = []
        tasks.forEach (val, id) =>
            v.push([val.get('position'), id])
        v.sort (a,b) -> misc.cmp(a[0], b[0])
        visible = immutable.fromJS((x[1] for x in v))

        @setState
            tasks   : tasks
            visible : visible

    save: =>
        @syncdb.save () =>
            @set_save_status()
        @set_save_status()

    set_save_status: =>
        #

    new_task: =>

    delete_task: =>

    move_task_to_top: =>

    move_task_to_bottom: =>

    time_travel: =>

    help: =>
