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
        # TODO: need to restrict to only those that are visible here...
        tasks.forEach (val, id) =>
            # assuming sorting by position here...
            v.push([val.get('position'), id])
            return
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
        # create new task positioned after the current task
        cur_pos = @store.getIn(['tasks', @store.get('current_task_id'), 'position'])

        if cur_pos?
            # TODO!
            position = 0
        else
            # no current task, so just put new task at the very beginning
            v = []
            @store.get('tasks')?.forEach (task, id) =>
                v.push(task.get('position'))
                return
            v.sort()
            position = (v[0] ? 1) - 1

        desc = (@store.get('selected_hashtags')?.toJS() ? []).join(' ')
        if desc.length > 0
            desc += "\n"
        desc += @store.get("search") ? ''
        task =
            task_id     : misc.uuid()
            desc        : desc
            position    : position
            last_edited : new Date() - 0
        @syncdb.set(task)

        @set_current_task(task.task_id)
        @set_editing(task.task_id)


    delete_task: =>

    move_task_to_top: =>

    move_task_to_bottom: =>

    time_travel: =>

    help: =>

    set_editing: (task_id) =>

    set_current_task: (task_id) =>
