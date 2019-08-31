###
Task Actions
###

LAST_EDITED_THRESH_S = 30

WIKI_HELP_URL = "https://doc.cocalc.com/tasks.html"

immutable  = require('immutable')
underscore = require('underscore')
{delay} = require('awaiting')

{Actions}  = require('../app-framework')

misc = require('smc-util/misc')

{HEADINGS, HEADINGS_DIR} = require('./headings')

{update_visible} = require('./update-visible')

keyboard = require('./keyboard')

{toggle_checkbox} = require('./desc-rendering')

class exports.TaskActions extends Actions
    _init: (project_id, path, syncdb, store, client) =>
        @_save_local_view_state = underscore.debounce((=>@__save_local_view_state?()), 1500)
        @_update_visible = underscore.throttle((=>@__update_visible?()), 500)
        @project_id = project_id
        @path       = path
        @syncdb     = syncdb
        @store      = store

        @setState
            local_task_state : immutable.Map()
            local_view_state : @_load_local_view_state()
            counts           : immutable.fromJS(done:0, deleted:0)

        @_init_has_unsaved_changes()
        @syncdb.on('change', @_syncdb_change)
        @syncdb.once('change', @_ensure_positions_are_unique)
        @syncdb.once('ready', @_syncdb_metadata)
        @syncdb.on('metadata-change', @_syncdb_metadata)

        @syncdb.once 'load-time-estimate', (est) => @setState(load_time_estimate: est)

    close: =>
        if @_state == 'closed'
            return
        @_state = 'closed'
        @__save_local_view_state?()
        @syncdb.close()
        delete @syncdb
        delete @_save_local_view_state
        delete @_update_visible
        if @_key_handler?
            @redux.getActions('page').erase_active_key_handler(@_key_handler)
            delete @_key_handler

    enable_key_handler: =>
        if @_state == 'closed'
            return
        @_key_handler ?= keyboard.create_key_handler(@)
        @redux.getActions('page').set_active_key_handler(@_key_handler, @project_id, @path)

    disable_key_handler: =>
        @redux.getActions('page').erase_active_key_handler(@_key_handler)

    __save_local_view_state: =>
        local_view_state = @store.get('local_view_state')
        if local_view_state? and localStorage?
            localStorage[@name] = JSON.stringify(local_view_state)

    _load_local_view_state: =>
        x = localStorage[@name]
        if x?
            local_view_state = immutable.fromJS(JSON.parse(x))
        local_view_state ?= immutable.Map()
        if not local_view_state.has("show_deleted")
            local_view_state = local_view_state.set('show_deleted', false)
        if not local_view_state.has("show_done")
            local_view_state = local_view_state.set('show_done', false)
        if not local_view_state.has("show_max")
            local_view_state = local_view_state.set('show_max', 50)
        if not local_view_state.has("font_size")
            font_size = @redux.getStore('account')?.get('font_size') ? 14
            local_view_state = local_view_state.set('font_size', font_size)
        if not local_view_state.has('sort')
            sort = immutable.fromJS({column:HEADINGS[0], dir:HEADINGS_DIR[0]})
            local_view_state = local_view_state.set('sort', sort)
        local_view_state = local_view_state.set('full_desc', local_view_state.get("full_desc")?.toSet() ? immutable.Set())

        return local_view_state


    _init_has_unsaved_changes: => # basically copies from jupyter/actions.coffee -- opportunity to refactor
        do_set = =>
            @setState
                has_unsaved_changes     : @syncdb?.has_unsaved_changes()
                has_uncommitted_changes : @syncdb?.has_uncommitted_changes()
        f = =>
            do_set()
            setTimeout(do_set, 3000)
        @set_save_status = underscore.debounce(f, 500)
        @syncdb.on('metadata-change', @set_save_status)
        @syncdb.on('connected',       @set_save_status)

    _syncdb_metadata: =>
        if not @syncdb? or not @store?  # may happen during close
            return
        read_only = @syncdb.is_read_only()
        if read_only != @store.get('read_only')
            @setState(read_only: read_only)

    _syncdb_change: (changes) =>
        if not @syncdb? or not @store?  # may happen during close
            return
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

    __update_visible: =>
        tasks           = @store.get('tasks')
        view            = @store.get('local_view_state')
        local_tasks     = @store.get('local_task_state')
        current_task_id = @store.get('current_task_id')
        counts          = @store.get('counts')

        obj = update_visible(tasks, local_tasks, view, counts, current_task_id)
        # We make obj explicit to avoid giving update_visible power to change anything about state...
        # This is just "explicit is better than implicit".
        obj = misc.copy_with(obj,
                ['visible', 'current_task_id', 'counts', 'hashtags', 'search_desc', 'search_terms'])
        @setState(obj)

    _ensure_positions_are_unique: =>
        tasks = @store.get('tasks')
        if not tasks?
            return
        # iterate through tasks adding their (string) positions to a "set" (using a map)
        s = {}
        unique = true
        tasks.forEach (task, id) =>
            pos = task.get('position')
            if not pos?
                # no position set at all -- just arbitrarily set it to 0; it'll get
                # fixed below, if this conflicts.
                pos = 0
                tasks = tasks.set(id, task.set('position', 0))
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
        task_id ?= @store.get('current_task_id')
        if not task_id?
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

    set_local_view_state: (obj, update_visible=true) =>
        if @_state == 'closed'
            return
        # Set local state related to what we see/search for/etc.
        local = @store.get('local_view_state')
        for key, value of obj
            local = local.set(key, immutable.fromJS(value))
        @setState
            local_view_state : local
        if update_visible
            @_update_visible()
        @_save_local_view_state()
        return

    save: =>
        if @_state == 'closed'
            return
        try
            await @syncdb.save_to_disk()
        catch err
            if @_state == 'closed'  # expected to fail when closing
                return
            # somehow report that save to disk failed.
            console.warn("Tasks save to disk failed ", err);
        @set_save_status()
        return

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

    set_task: (task_id, obj, setState) =>
        if not obj? or @_state == 'closed'
            return
        task_id ?= @store.get('current_task_id')
        if not task_id?
            return
        task = @store.getIn(['tasks', task_id])
        # Update last_edited if desc or due date changes
        if not task? or (obj.desc? and obj.desc != task.get('desc') or (obj.due_date? and obj.due_date != task.get('due_date')) \
                         or (obj.done? and obj.done != task.get('done')))
            last_edited = @store.getIn(['tasks', task_id, 'last_edited']) ? 0
            now = new Date() - 0
            if now - last_edited >= LAST_EDITED_THRESH_S*1000
                obj.last_edited = now

        obj.task_id = task_id
        @syncdb.set(obj)
        @syncdb.commit()
        if setState
            # also set state directly in the tasks object locally **immediately**; this would happen
            # eventually as a result of the syncdb set above.
            tasks = @store.get('tasks')
            task = tasks.get(task_id)
            for k, v of obj
                task = task.set(k, immutable.fromJS(v))
            tasks = tasks.set(task_id, task)
            @setState(tasks: tasks)

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

    # only deleta = 1 or -1 is supported!
    move_task_delta: (delta) =>
        if delta != 1 and delta != -1
            return
        task_id = @store.get('current_task_id')
        if not task_id?
            return
        visible = @store.get('visible')
        if not visible?
            return
        i = visible.indexOf(task_id)
        if i == -1
            return
        j = i + delta
        if j < 0 or j >= visible.size
            return
        # swap positions for i and j
        tasks = @store.get('tasks')
        pos_i = tasks.getIn([task_id, 'position'])
        pos_j = tasks.getIn([visible.get(j), 'position'])
        @set_task(task_id,        {position:pos_j}, true)
        @set_task(visible.get(j), {position:pos_i}, true)
        @scroll_into_view()

    time_travel: =>
        @redux.getProjectActions(@project_id).open_file
            path       : misc.history_path(@path)
            foreground : true

    help: =>
        window.open(WIKI_HELP_URL, "_blank").focus()

    set_current_task: (task_id) =>
        @setState(current_task_id : task_id)
        @scroll_into_view()

    set_current_task_delta: (delta) =>
        task_id = @store.get('current_task_id')
        if not task_id?
            return
        visible = @store.get('visible')
        if not visible?
            return
        i = visible.indexOf(task_id)
        if i == -1
            return
        i += delta
        if i < 0
            i = 0
        else if i >= visible.size
            i = visible.size - 1
        new_task_id = visible.get(i)
        if new_task_id?
            @set_current_task(new_task_id)

    undo: =>
        if !@syncdb?
            return
        @syncdb.undo()
        @syncdb.commit()

    redo: =>
        if !@syncdb?
            return
        @syncdb.redo()
        @syncdb.commit()

    set_task_not_done: (task_id) =>
        task_id ?= @store.get('current_task_id')
        @set_task(task_id, {done:false})

    set_task_done: (task_id) =>
        task_id ?= @store.get('current_task_id')
        @set_task(task_id, {done:true})

    toggle_task_done: (task_id) =>
        task_id ?= @store.get('current_task_id')
        if task_id?
            @set_task(task_id, {done:!@store.getIn(['tasks', task_id, 'done'])}, true)

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

    toggle_full_desc: (task_id) =>
        task_id ?= @store.get('current_task_id')
        if not task_id?
            return
        view = @store.getIn('local_view_state')
        full_desc = view.get('full_desc')
        if full_desc.has(task_id)
            view = view.set('full_desc', full_desc.remove(task_id))
        else
            view = view.set('full_desc', full_desc.add(task_id))
        @setState
            local_view_state : view
        @_update_visible()
        @_save_local_view_state()

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
            if task.get('deleted')
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

    # dir = 'asc' or 'desc'
    # columns are strings in headings.cjsx
    set_sort_column: (column, dir) =>
        view = @store.get('local_view_state')
        sort = view.get('sort') ? immutable.Map()
        sort = sort.set('column', column)
        sort = sort.set('dir', dir)
        view = view.set('sort', sort)
        @setState(local_view_state: view)
        @_update_visible()

    # Move task that was at position old_index to now be at position new_index
    reorder_tasks: (old_index, new_index) =>
        if old_index == new_index
            return
        visible = @store.get('visible')

        old_id = visible.get(old_index)
        new_id = visible.get(new_index)
        new_pos = @store.getIn(['tasks', new_id, 'position'])
        if not new_id? or not new_pos?
            return
        if new_index == 0
            # moving to very beginning
            set_pos = new_pos - 1
        else if new_index < old_index
            before_id = visible.get(new_index-1)
            before_pos = @store.getIn(['tasks', before_id, 'position']) ? (new_pos - 1)
            set_pos = (new_pos + before_pos)/2
        else if new_index > old_index
            after_id = visible.get(new_index+1)
            after_pos = @store.getIn(['tasks', after_id, 'position']) ? (new_pos + 1)
            set_pos = (new_pos + after_pos)/2
        @set_task(old_id, {position:set_pos}, true)
        @__update_visible()

    focus_find_box: =>
        @disable_key_handler()
        @setState(focus_find_box:true)

    blur_find_box: =>
        @enable_key_handler()
        @setState(focus_find_box:false)

    scroll_into_view: =>
        setTimeout((=>@setState(scroll_into_view: true)), 50)

    scroll_into_view_done: =>
        @setState(scroll_into_view: false)

    set_show_max: (show_max) =>
        @set_local_view_state({show_max: show_max}, false)

    start_timer: (task_id) =>
        ###
        task = @store.getIn(['tasks', task_id])
        if not task?
            return
        timer = task.get('timer') ?
        @set_task(task_id, {timer:{total:}})
        ###

    stop_timer: (task_id) =>

    delete_timer: (task_id) =>

    toggle_desc_checkbox: (task_id, index, checked) =>
        desc = @store.getIn(['tasks', task_id, 'desc'])
        if not desc?
            return
        desc = toggle_checkbox(desc, index, checked)
        @set_desc(task_id, desc)

    hide: =>
        @disable_key_handler()

    show: =>
        await delay(1)
        @enable_key_handler()