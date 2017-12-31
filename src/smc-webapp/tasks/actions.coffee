###
Task Actions
###

LAST_EDITED_THRESH_S = 30

immutable  = require('immutable')
underscore = require('underscore')

{Actions}  = require('../smc-react')

misc = require('smc-util/misc')

{search_matches, get_search} = require('./search')

WIKI_HELP_URL = "https://github.com/sagemathinc/cocalc/wiki/tasks"

class exports.TaskActions extends Actions
    _init: (project_id, path, syncdb, store, client) =>
        @project_id = project_id
        @path       = path
        @syncdb     = syncdb
        @store      = store

        # TODO: local_task_state and local_view_state need to persist to localStorage
        x = localStorage[@name]
        if x?
            local_view_state = immutable.fromJS(JSON.parse(x))
        else
            font_size = @redux.getStore('account')?.get('font_size') ? 14
            local_view_state = immutable.fromJS(show_deleted:false, show_done:false, font_size:font_size)
        @setState
            local_task_state : immutable.Map()
            local_view_state : local_view_state
            counts           : immutable.fromJS(done:0, deleted:0)

        @_init_has_unsaved_changes()
        @syncdb.on('change', @_syncdb_change)
        @syncdb.once('change', @_ensure_positions_are_unique)
        @_save_local_view_state = underscore.debounce(@__save_local_view_state, 3000)

    close: =>
        if @_state == 'closed'
            return
        @_state = 'closed'
        @__save_local_view_state()
        @syncdb.close()
        delete @syncdb
        if @_key_handler?
            @redux.getActions('page').erase_active_key_handler(@_key_handler)
            delete @_key_handler

    __save_local_view_state: =>
        local_view_state = @store.get('local_view_state')
        if local_view_state and localStorage?
            localStorage[@name] = JSON.stringify(local_view_state)

    _init_has_unsaved_changes: => # basically copies from jupyter/actions.coffee -- opportunity to refactor
        do_set = =>
            @setState
                has_unsaved_changes     : @syncdb?.has_unsaved_changes()
                has_uncommitted_changes : @syncdb?.has_uncommitted_changes()
        f = =>
            do_set()
            setTimeout(do_set, 3000)
        @set_save_status = underscore.debounce(f, 1500)
        @syncdb.on('metadata-change', @set_save_status)
        @syncdb.on('connected',       @set_save_status)

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

        @setState(tasks : tasks)

        @_update_visible()

        @set_save_status?()

    _update_visible: =>
        tasks           = @store.get('tasks')
        view            = @store.get('local_view_state')
        show_deleted    = !!view.get('show_deleted')
        show_done       = !!view.get('show_done')
        current_task_id = @store.get('current_task_id')

        relevant_tags = {}
        tasks.forEach (task, id) =>
            if not show_deleted and task.get('deleted')
                return
            if not show_done and task.get('done')
                return
            desc = task.get('desc')
            for x in misc.parse_hashtags(desc)
                tag = desc.slice(x[0]+1, x[1]).toLowerCase()
                relevant_tags[tag] = true

        search0 = get_search(view, relevant_tags)
        search = []
        if search0
            for x in misc.search_split(search0.toLowerCase())
                x = x.trim()
                if x
                    search.push(x)

        v = []
        counts =
            done    : 0
            deleted : 0
        current_is_visible = false

        hashtags = {}
        tasks.forEach (task, id) =>
            if task.get('done')
                counts.done    += 1
            if task.get('deleted')
                counts.deleted += 1
            if not show_deleted and task.get('deleted')
                return
            if not show_done and task.get('done')
                return

            desc = task.get('desc')
            if search_matches(search, desc)
                visible = 1  # tag of a currently visible task
                if id == current_task_id
                    current_is_visible = true
                # TODO: assuming sorting by position here...
                v.push([task.get('position'), id])
            else
                visible = 0  # not a tag of any currently visible task

            for x in misc.parse_hashtags(desc)
                tag = desc.slice(x[0]+1, x[1]).toLowerCase()
                hashtags[tag] = Math.max(hashtags[tag] ? 0, visible)
            return

        v.sort (a,b) -> misc.cmp(a[0], b[0])
        visible = immutable.fromJS((x[1] for x in v))

        if (not current_task_id? or not current_is_visible) and visible.size > 0
            current_task_id = visible.get(0)
        else if not current_is_visible and visible.size == 0
            current_task_id = undefined

        c = @store.get('counts')
        if c.get('done') != counts.done
            c = c.set('done', counts.done)
        if c.get('deleted') != counts.deleted
            c = c.set('deleted', counts.deleted)

        @setState
            visible         : visible
            current_task_id : current_task_id
            counts          : c
            hashtags        : immutable.fromJS(hashtags)
            search_desc     : search.join(' ')

    _ensure_positions_are_unique: =>
        tasks = @store.get('tasks')
        if not tasks?
            return
        # iterate through tasks adding their (string) positions to a "set" (using a map)
        s = {}
        unique = true
        tasks.forEach (task, id) =>
            pos = task.get('position')
            if s[pos]  # already got this position -- so they can't be unique
                unique = false
                return false
            s[pos] = true
            return
        if unique
            # positions turned out to all be unique - done
            return
        # positions are NOT unique - this could happen, e.g., due to merging offline changes.
        # We fix this by simply spreading them all out to be 0 to n, arbitrarily breaking ties.
        v = []
        tasks.forEach (task, id) =>
            v.push([task.get('position'), id])
        v.sort (a,b) -> misc.cmp(a[0], b[0])
        pos = 0
        for x in v
            @set_task(x[1], {position:pos})
            pos += 1

    set_local_task_state: (task_id, obj) =>
        if @_state == 'closed'
            return
        # Set local state related to a specific task -- this is NOT sync'd between clients
        local = @store.get('local_task_state')
        obj.task_id = task_id
        x = local.get(obj.task_id)
        if not x?
            x = immutable.fromJS(obj)
        else
            for k, v of obj
                x = x.set(k, immutable.fromJS(v))
        @setState
            local_task_state : local.set(obj.task_id, x)

    set_local_view_state: (obj) =>
        if @_state == 'closed'
            return
        # Set local state related to what we see/search for/etc.
        local = @store.get('local_view_state')
        for key, value of obj
            local = local.set(key, immutable.fromJS(value))
        @setState
            local_view_state : local
        @_update_visible()
        @_save_local_view_state()

    save: =>
        @setState(has_unsaved_changes:false)
        @syncdb.save () =>
            @set_save_status()

    new_task: =>
        # create new task positioned before the current task
        cur_pos = @store.getIn(['tasks', @store.get('current_task_id'), 'position'])

        positions = @store.get_positions()
        if cur_pos? and positions?.length > 0
            position = undefined
            for i in [1...positions.length]
                if cur_pos == positions[i]
                    position = (positions[i-1] + positions[i]) / 2
                    break
            if not position?
                position = positions[0] - 1
        else
            # There is no current visible task, so just put new task at the very beginning.
            if positions.length > 0
                position = positions[0] - 1
            else
                position = 0

        desc = (@store.get('selected_hashtags')?.toJS() ? []).join(' ')
        if desc.length > 0
            desc += "\n"

        search = @store.get('search_desc')
        # do not include any negations
        search = (x for x in misc.search_split(search) when x[0] != '-').join(' ')
        desc += search

        task_id = misc.uuid()
        @set_task(task_id, {desc:desc, position:position})
        @set_current_task(task_id)
        @edit_desc(task_id)

    set_task: (task_id, obj) =>
        if not task_id? or not obj? or @_state == 'closed'
            return
        last_edited = @store.getIn(['tasks', task_id, 'last_edited']) ? 0
        now = new Date() - 0
        if now - last_edited >= LAST_EDITED_THRESH_S*1000
            obj.last_edited = now
        obj.task_id = task_id
        @syncdb.set(obj)
        @syncdb.save()

    delete_task: (task_id) =>
        @set_task(task_id, {deleted: true})

    undelete_task: (task_id) =>
        @set_task(task_id, {deleted: false})

    delete_current_task: =>
        @delete_task(@store.get('current_task_id'))

    undelete_current_task: =>
        @undelete_task(@store.get('current_task_id'))

    move_task_to_top: =>
        @set_task(@store.get('current_task_id'), {position: @store.get_positions()[0] - 1})

    move_task_to_bottom: =>
        @set_task(@store.get('current_task_id'), {position: @store.get_positions().slice(-1)[0] + 1})

    time_travel: =>
        @redux.getProjectActions(@project_id).open_file
            path       : misc.history_path(@path)
            foreground : true

    help: =>
        window.open(WIKI_HELP_URL, "_blank").focus()

    set_current_task: (task_id) =>
        @setState(current_task_id : task_id)

    undo: =>
        @syncdb?.undo()

    redo: =>
        @syncdb?.redo()

    set_task_not_done: (task_id) =>
        @set_task(task_id, {done:false})

    set_task_done: (task_id) =>
        @set_task(task_id, {done:true})

    stop_editing_due_date: (task_id) =>
        @set_local_task_state(task_id, {editing_due_date : false})

    edit_due_date: (task_id) =>
        @set_local_task_state(task_id, {editing_due_date : true})

    stop_editing_desc: (task_id) =>
        @set_local_task_state(task_id, {editing_desc : false})

    edit_desc: (task_id) =>
        @set_local_task_state(task_id, {editing_desc : true})

    set_due_date: (task_id, date) =>
        @set_task(task_id, {due_date:date})

    set_desc: (task_id, desc) =>
        @set_task(task_id, {desc:desc})

    minimize_desc: (task_id) =>
        @set_local_task_state(task_id, {min_desc : true})

    maximize_desc: (task_id) =>
        @set_local_task_state(task_id, {min_desc : false})

    show_deleted: =>
        @set_local_view_state(show_deleted: true)

    stop_showing_deleted: =>
        @set_local_view_state(show_deleted: false)

    show_done: =>
        @set_local_view_state(show_done: true)

    stop_showing_done: =>
        @set_local_view_state(show_done: false)

    set_font_size: (size) =>
        @set_local_view_state(font_size: size)

    increase_font_size: =>
        size = @store.getIn(['local_view_state', 'font_size'])
        @set_local_view_state(font_size: size+1)

    decrease_font_size: =>
        size = @store.getIn(['local_view_state', 'font_size'])
        @set_local_view_state(font_size: size-1)

    empty_trash: =>
        @store.get('tasks')?.forEach (task, id) =>
            @syncdb.delete(task_id: id)
            return

    # state = undefined/false-ish = not selected
    # state = 1 = selected
    # state = -1 = negated
    set_hashtag_state: (tag, state) =>
        if not tag?
            return
        selected_hashtags = @store.getIn(['local_view_state', 'selected_hashtags']) ? immutable.Map()
        if not state
            selected_hashtags = selected_hashtags.delete(tag)
        else
            selected_hashtags = selected_hashtags.set(tag, state)
        @set_local_view_state(selected_hashtags : selected_hashtags)

