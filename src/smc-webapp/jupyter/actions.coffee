###
Jupyter client

The goal here is to make a simple proof of concept editor for working with
Jupyter notebooks.  The goals are:
 1. to **look** like the normal jupyter notebook
 2. work like the normal jupyter notebook
 3. work perfectly regarding realtime sync and history browsing

###

immutable  = require('immutable')
underscore = require('underscore')

misc       = require('smc-util/misc')
{required, defaults} = misc

{Actions}  = require('../app-framework')

util       = require('./util')

server_urls = require('./server-urls')

parsing    = require('./parsing')

keyboard   = require('./keyboard')

commands   = require('./commands')

cell_utils = require('./cell-utils')

{cm_options} = require('./cm_options')

jupyter_kernels = undefined

{IPynbImporter} = require('./import-from-ipynb')

#DEFAULT_KERNEL = 'python2'
#DEFAULT_KERNEL = 'anaconda3'
DEFAULT_KERNEL = 'sagemath'

syncstring    = require('smc-util/syncstring')

{instantiate_assistant} = require('../assistant/main')


###
The actions -- what you can do with a jupyter notebook, and also the
underlying synchronized state.
###

bounded_integer = (n, min, max, def) ->
    if typeof(n) != 'number'
        n = parseInt(n)
    if isNaN(n)
        return def
    n = Math.round(n)
    if n < min
        return min
    if n > max
        return max
    return n

# no worries, they don't break react rendering even when they escape
CellWriteProtectedException = new Error('CellWriteProtectedException')
CellDeleteProtectedException = new Error('CellDeleteProtectedException')

class exports.JupyterActions extends Actions

    _init: (project_id, path, syncdb, store, client) =>
        store.dbg = (f) => return client.dbg("JupyterStore('#{store.get('path')}').#{f}")
        @util = util # TODO: for debugging only
        @_state      = 'init'   # 'init', 'load', 'ready', 'closed'
        @store       = store
        @project_id  = project_id
        @path        = path
        store.syncdb = syncdb
        @syncdb      = syncdb
        @_client     = client
        @_is_project = client.is_project()  # the project client is designated to manage execution/conflict, etc.
        store._is_project = @_is_project
        @_account_id = client.client_id()   # project or account's id

        # this initializes actions+store for the assistant -- are "sub-actions" a thing?
        if not @_is_project   # this is also only a UI specific action
            @assistant_actions = instantiate_assistant(project_id, path)

        @setState
            view_mode           : 'normal'
            error               : undefined
            cur_id              : @store.get_local_storage('cur_id')
            toolbar             : not @store.get_local_storage('hide_toolbar')
            has_unsaved_changes : false
            sel_ids             : immutable.Set()  # immutable set of selected cells
            md_edit_ids         : immutable.Set()  # set of ids of markdown cells in edit mode
            mode                : 'escape'
            font_size           : @store.get_local_storage('font_size') ? @redux.getStore('account')?.get('font_size') ? 14
            project_id          : project_id
            directory           : misc.path_split(path)?.head
            path                : path
            is_focused          : false            # whether or not the editor is focused.
            max_output_length   : 10000

        if @_client
            do_set = =>
                @setState
                    has_unsaved_changes     : @syncdb?.has_unsaved_changes()
                    has_uncommitted_changes : @syncdb?.has_uncommitted_changes()
            f = =>
                do_set()
                setTimeout(do_set, 3000)
            @set_save_status = underscore.debounce(f, 1500)
            @syncdb.on('metadata-change', @set_save_status)
            @syncdb.on('connected', @set_save_status)

            # Also maintain read_only state.
            @syncdb.on('metadata-change', @sync_read_only)
            @syncdb.on('connected', @sync_read_only)

            # Browser Client: Wait until the .ipynb file has actually been parsed into
            # the (hidden, e.g. .a.ipynb.sage-jupyter2) syncdb file,
            # then set the kernel, if necessary.
            @syncdb.wait
                until : (s) =>
                    return !!s.get_one({"type":"file"})
                cb    : => @_syncdb_init_kernel()


        @syncdb.on('change', @_syncdb_change)

        @syncdb.once 'change', =>
            # Important -- this also gets run on the backend, where
            # @redux.getProjectActions(project_id) is maybe undefined...
            @redux.getProjectActions(project_id)?.log_opened_time(path)


        if not client.is_project() # project doesn't care about cursors
            @syncdb.on('cursor_activity', @_syncdb_cursor_activity)

        if not client.is_project() and window?.$?
            # frontend browser client with jQuery
            @set_jupyter_kernels()  # must be after setting project_id above.

            # set codemirror editor options whenever account editor_settings change.
            account_store = @redux.getStore('account')
            account_store.on('change', @_account_change)
            @_account_change_editor_settings = account_store.get('editor_settings')
            @_commands = commands.commands(@)

            @init_scroll_pos_hook()

    sync_read_only: =>
        a = @store.get('read_only')
        b = @syncdb?.is_read_only()
        if a != b
            @setState(read_only: b)
            @set_cm_options()

    init_scroll_pos_hook: =>
        # maintain scroll hook on change; critical for multiuser editing
        before = after = undefined
        @_hook_before_change = =>
            before = $(".cocalc-jupyter-hook").offset()?.top
        @_hook_after_change = =>
            after  = $(".cocalc-jupyter-hook").offset()?.top
            if before? and after? and before != after
                @scroll(after - before)

    _account_change: (state) => # TODO: this is just an ugly hack until we implement redux change listeners for particular keys.
        if not state.get('editor_settings').equals(@_account_change_editor_settings)
            new_settings = state.get('editor_settings')
            if @_account_change_editor_settings.get('jupyter_keyboard_shortcuts') != new_settings.get('jupyter_keyboard_shortcuts')
                @update_keyboard_shortcuts()

            @_account_change_editor_settings = new_settings
            @set_cm_options()

    dbg: (f) =>
        return @_client.dbg("JupyterActions('#{@store.get('path')}').#{f}")

    close: =>
        if @_state == 'closed'
            return
        @set_local_storage('cur_id', @store.get('cur_id'))
        @_state = 'closed'
        @syncdb.close()
        delete @syncdb
        delete @_commands
        if @_key_handler?
            @redux.getActions('page').erase_active_key_handler(@_key_handler)
            delete @_key_handler
        if @_file_watcher?
            @_file_watcher.close()
            delete @_file_watcher
        if not @_is_project
            @redux.getStore('account')?.removeListener('change', @_account_change)

    enable_key_handler: =>
        if @_state == 'closed'
            return
        @_key_handler ?= keyboard.create_key_handler(@)
        @redux.getActions('page').set_active_key_handler(@_key_handler, @project_id, @path)

    disable_key_handler: =>
        @redux.getActions('page').erase_active_key_handler(@_key_handler)

    _ajax: (opts) =>
        opts = defaults opts,
            url     : required
            timeout : 15000
            cb      : undefined    # (err, data as Javascript object -- i.e., JSON is parsed)
        if not $?
            opts.cb?("_ajax only makes sense in browser")
            return
        $.ajax(
            url     : opts.url
            timeout : opts.timeout
            success : (data) =>
                #try
                    opts.cb?(undefined, JSON.parse(data))
                #catch err
                #    opts.cb?("#{err}")
        ).fail (err) => opts.cb?(err.statusText ? 'error')
        return

    fetch_jupyter_kernels: =>
        f = (cb) =>
            if @_state == 'closed'
                cb(); return
            @_ajax
                url     : server_urls.get_server_url(@store.get('project_id')) + '/kernels.json'
                timeout : 3000
                cb      : (err, data) =>
                    if err
                        cb(err)
                        return
                    try
                        jupyter_kernels = immutable.fromJS(data)
                        @setState(kernels: jupyter_kernels)
                        # We must also update the kernel info (e.g., display name), now that we
                        # know the kernels (e.g., maybe it changed or is now known but wasn't before).
                        @setState(kernel_info: @store.get_kernel_info(@store.get('kernel')))
                        cb()
                    catch e
                        @set_error("Error setting Jupyter kernels -- #{data} #{e}")

        misc.retry_until_success
            f           : f
            start_delay : 1500
            max_delay   : 15000
            max_time    : 60000

    set_jupyter_kernels: =>
        if jupyter_kernels?
            @setState(kernels: jupyter_kernels)
        else
            @fetch_jupyter_kernels()

    set_error: (err) =>
        if not err?
            @setState(error: undefined)            # delete from store
            return
        cur = @store.get('error')
        # don't show the same error more than once
        return if cur?.indexOf(err) >= 0
        if cur
            err = err + '\n\n' + cur
        @setState
            error : err

    # Set the input of the given cell in the syncdb, which will also change the store.
    # Might throw a CellWriteProtectedException
    set_cell_input: (id, input, save=true) =>
        return if @store.check_edit_protection(id, @)
        @_set
            type  : 'cell'
            id    : id
            input : input
            start : null
            end   : null,
            save

    set_cell_output: (id, output, save=true) =>
        @_set
            type   : 'cell'
            id     : id
            output : output,
            save

    clear_selected_outputs: =>
        cells = @store.get('cells')
        v = @store.get_selected_cell_ids_list()
        for id in v
            cell = cells.get(id)
            if not @store.is_cell_editable(id)
                if v.length == 1
                    @show_edit_protection_error()
                continue
            if cell.get('output')? or cell.get('exec_count')
                @_set({type:'cell', id:id, output:null, exec_count:null}, false)
        @_sync()

    clear_all_outputs: =>
        not_editable = 0
        @store.get('cells').forEach (cell, id) =>
            if cell.get('output')? or cell.get('exec_count')
                if not @store.is_cell_editable(id)
                    not_editable += 1
                else
                    @_set({type:'cell', id:id, output:null, exec_count:null}, false)
            return
        @_sync()
        if not_editable > 0
            @set_error("One or more cells are protected from editing.")

    # prop can be: 'collapsed', 'scrolled'
    toggle_output: (id, prop) =>
        if @store.getIn(['cells', id, 'cell_type']) ? 'code' == 'code'
            @_set(type:'cell', id:id, "#{prop}": not @store.getIn(['cells', id, prop]))

    toggle_selected_outputs: (prop) =>
        cells = @store.get('cells')
        for id in @store.get_selected_cell_ids_list()
            cell = cells.get(id)
            if cell.get('cell_type') ? 'code' == 'code'
                @_set({type:'cell', id:id, "#{prop}": not cell.get(prop)}, false)
        @_sync()

    toggle_all_outputs: (prop) =>
        @store.get('cells').forEach (cell, id) =>
            if cell.get('cell_type') ? 'code' == 'code'
                @_set({type:'cell', id:id, "#{prop}": not cell.get(prop)}, false)
            return
        @_sync()

    set_cell_pos: (id, pos, save=true) =>
        @_set({type: 'cell', id: id, pos: pos}, save)

    set_cell_type: (id, cell_type='code') =>
        if cell_type != 'markdown' and cell_type != 'raw' and cell_type != 'code'
            throw Error("cell type (='#{cell_type}') must be 'markdown', 'raw', or 'code'")
        return if @store.check_edit_protection(id, @)
        obj =
            type      : 'cell'
            id        : id
            cell_type : cell_type
        if cell_type != 'code'
            # delete output and exec time info when switching to non-code cell_type
            obj.output = obj.start = obj.end = obj.collapsed = obj.scrolled = null
        @_set(obj)

    set_selected_cell_type: (cell_type) =>
        sel_ids = @store.get('sel_ids')
        cur_id = @store.get('cur_id')
        if sel_ids.size == 0
            if cur_id?
                @set_cell_type(cur_id, cell_type)
        else
            sel_ids.forEach (id) =>
                @set_cell_type(id, cell_type)
                return

    # Might throw a CellWriteProtectedException
    set_md_cell_editing: (id) =>
        md_edit_ids = @store.get('md_edit_ids')
        if md_edit_ids.contains(id)
            return
        return if @store.check_edit_protection(id, @)
        @setState(md_edit_ids : md_edit_ids.add(id))

    set_md_cell_not_editing: (id) =>
        md_edit_ids = @store.get('md_edit_ids')
        if not md_edit_ids.contains(id)
            return
        @setState(md_edit_ids : md_edit_ids.delete(id))

    change_cell_to_heading: (id, n=1) =>
        return if @store.check_edit_protection(id, @)
        @set_md_cell_editing(id)
        @set_cell_type(id, 'markdown')
        input = misc.lstrip(@_get_cell_input(id))
        i = 0
        while i < input.length and input[i] == '#'
            i += 1
        input = ('#' for _ in [0...n]).join('') + \
            (if not misc.is_whitespace(input[i]) then ' ' else '') + input.slice(i)
        @set_cell_input(id, input)

    # Set which cell is currently the cursor.
    set_cur_id: (id) =>
        if @store.getIn(['cells', id, 'cell_type']) == 'markdown' and @store.get('mode') == 'edit'
            if @store.is_cell_editable(id)
                @set_md_cell_editing(id)
        @setState(cur_id : id)

    set_cur_id_from_index: (i) =>
        if not i?
            return
        cell_list = @store.get('cell_list')
        if not cell_list?
            return
        if i < 0
            i = 0
        else if i >= cell_list.size
            i = cell_list.size - 1
        @set_cur_id(cell_list.get(i))

    select_cell: (id) =>
        sel_ids = @store.get('sel_ids')
        if sel_ids.contains(id)
            return
        @setState(sel_ids : sel_ids.add(id))

    unselect_cell: (id) =>
        sel_ids = @store.get('sel_ids')
        if not sel_ids.contains(id)
            return
        @setState(sel_ids : sel_ids.remove(id))

    unselect_all_cells: =>
        @setState(sel_ids : immutable.Set())

    select_all_cells: =>
        @setState(sel_ids : @store.get('cell_list').toSet())

    # select all cells from the currently focused one (where the cursor is -- cur_id)
    # to the cell with the given id, then set the cursor to be at id.
    select_cell_range: (id) =>
        cur_id = @store.get('cur_id')
        if not cur_id?
            # no range -- just select the new id
            @set_cur_id(id)
            return
        sel_ids = @store.get('sel_ids')
        if cur_id == id # little to do...
            if sel_ids.size > 0
                @setState(sel_ids : immutable.Set())  # empty (cur_id always included)
            return
        v = @store.get('cell_list').toJS()
        for [i, x] in misc.enumerate(v)
            if x == id
                endpoint0 = i
            if x == cur_id
                endpoint1 = i
        sel_ids = immutable.Set( (v[i] for i in [endpoint0..endpoint1]) )
        @setState
            sel_ids : sel_ids
            cur_id  : id

    extend_selection: (delta) =>
        cur_id = @store.get('cur_id')
        @move_cursor(delta)
        target_id = @store.get('cur_id')
        if cur_id == target_id
            # no move
            return
        sel_ids = @store.get('sel_ids')
        if sel_ids?.get(target_id)
            # moved cursor onto a selected cell
            if sel_ids.size <= 2
                # selection clears if shrinks to 1
                @unselect_all_cells()
            else
                @unselect_cell(cur_id)
        else
            # moved onto a not-selected cell
            @select_cell(cur_id)
            @select_cell(target_id)

    set_mode: (mode) =>
        if mode == 'escape'
            if @store.get('mode') == 'escape'
                return
            # switching from edit to escape mode.
            # save code being typed
            @_get_cell_input()
            # Now switch.
            @setState(mode: mode)
            @set_cursor_locs([])  # none
        else if mode == 'edit'
            # switch to focused
            @focus_unlock()
            if @store.get('mode') == 'edit'
                return
            # from escape to edit
            id = @store.get('cur_id')
            if not @store.is_cell_editable(id)
                #@set_error("This cell is protected from being edited.")
            else
                @setState(mode:mode)
                type = @store.getIn(['cells', id, 'cell_type'])
                if type == 'markdown'
                    @set_md_cell_editing(id)
        else
            @set_error("unknown mode '#{mode}'")

    set_cell_list: =>
        cells = @store.get('cells')
        if not cells?
            return
        cell_list = cell_utils.sorted_cell_list(cells)
        if not cell_list.equals(@store.get('cell_list'))
            @setState(cell_list : cell_list)
        return

    _syncdb_cell_change: (id, new_cell) =>
        if typeof(id) != 'string'
            console.warn("ignoring cell with invalid id='#{JSON.stringify(id)}'")
            return
        cells = @store.get('cells') ? immutable.Map()
        cell_list_needs_recompute = false
        #@dbg("_syncdb_cell_change")("#{id} #{JSON.stringify(new_cell?.toJS())}")
        old_cell = cells.get(id)
        if not new_cell?
            # delete cell
            @reset_more_output(id)  # free up memory locally
            if old_cell?
                obj = {cells: cells.delete(id)}
                cell_list = @store.get('cell_list')
                if cell_list?
                    obj.cell_list = cell_list.filter((x) -> x != id)
                @setState(obj)
        else
            # change or add cell
            old_cell = cells.get(id)
            if new_cell.equals(old_cell)
                return # nothing to do
            if old_cell? and new_cell.get('start') != old_cell.get('start')
                # cell re-evaluated so any more output is no longer valid.
                @reset_more_output(id)
            obj = {cells: cells.set(id, new_cell)}
            if not old_cell? or old_cell.get('pos') != new_cell.get('pos')
                cell_list_needs_recompute = true
            @setState(obj)
            if @store.getIn(['edit_cell_metadata', 'id']) == id
                @edit_cell_metadata(id)  # updates the state during active editing.

        if @_is_project
            @manager_on_cell_change(id, new_cell, old_cell)
        @store.emit('cell_change', id, new_cell, old_cell)

        return cell_list_needs_recompute

    _syncdb_change: (changes) =>
        @_hook_before_change?()
        @__syncdb_change(changes)
        @_hook_after_change?()
        @set_save_status?()

    __syncdb_change: (changes) =>
        do_init = @_is_project and @_state == 'init'
        #@dbg("_syncdb_change")(JSON.stringify(changes?.toJS()))
        cell_list_needs_recompute = false
        changes?.forEach (key) =>
            record = @syncdb.get_one(key)
            switch key.get('type')
                when 'cell'
                    if @_syncdb_cell_change(key.get('id'), record)
                        cell_list_needs_recompute = true
                when 'fatal'
                    error = record?.get('error')
                    @setState(fatal: error)
                    # This check can be deleted in a few weeks:
                    if error? and error.indexOf('file is currently being read or written') != -1
                        # No longer relevant -- see https://github.com/sagemathinc/cocalc/issues/1742
                        @syncdb.delete(type:'fatal')
                when 'nbconvert'
                    if @_is_project
                        # before setting in store, let backend react to change
                        @nbconvert_change(@store.get('nbconvert'), record)
                    # Now set in our store.
                    @setState(nbconvert: record)
                when 'settings'
                    if not record?
                        return
                    orig_kernel = @store.get('kernel')
                    kernel = record.get('kernel')
                    obj =
                        trust             : !!record.get('trust')  # case to boolean
                        backend_state     : record.get('backend_state')
                        kernel_state      : record.get('kernel_state')
                        kernel_usage      : record.get('kernel_usage')
                        metadata          : record.get('metadata')   # extra custom user-specified metadata
                        max_output_length : bounded_integer(record.get('max_output_length'), 100, 100000, 20000)
                    if kernel != orig_kernel
                        obj.kernel              = kernel
                        obj.kernel_info         = @store.get_kernel_info(kernel)
                        obj.backend_kernel_info = undefined
                    else
                        kernel_changed = false
                    @setState(obj)
                    if not @_is_project and orig_kernel != kernel
                        @set_backend_kernel_info()
                        @set_cm_options()
            return
        if cell_list_needs_recompute
            @set_cell_list()
        cur_id = @store.get('cur_id')
        if not cur_id? or not @store.getIn(['cells', cur_id])?
            @set_cur_id(@store.get('cell_list')?.get(0))

        if @_is_project
            if do_init
                @initialize_manager()
            if @store.get('kernel')
                @manager_run_cell_process_queue()
        else
            # client
            if @_state == 'init'
                @_state = 'ready'

            if @store.get("view_mode") == 'raw'
                @set_raw_ipynb()

    _syncdb_init_kernel: =>
        default_kernel = @redux.getStore('account')?.getIn(['editor_settings', 'jupyter', 'kernel'])
        if not @store.get('kernel')
            # Creating a new notebook with no kernel set
            kernel = default_kernel ? DEFAULT_KERNEL
            @set_kernel(kernel)
        else
            # Opening an existing notebook
            if not default_kernel
                # But user has no default kernel, since they never before explicitly set one.
                # So we set it.  This is so that a user's default
                # kernel is that of the first ipynb they
                # opened, which is very sensible in courses.
                @set_default_kernel(@store.get('kernel'))

    _syncdb_cursor_activity: =>
        cells = cells_before = @store.get('cells')
        next_cursors = @syncdb.get_cursors()
        next_cursors.forEach (info, account_id) =>
            last_info = @_last_cursors?.get(account_id)
            if last_info?.equals(info)
                # no change for this particular users, so nothing further to do
                return
            # delete old cursor locations
            last_info?.get('locs').forEach (loc) =>
                id = loc.get('id')
                cell = cells.get(id)
                if not cell?
                    return
                cursors = cell.get('cursors') ? immutable.Map()
                if cursors.has(account_id)
                    cells = cells.set(id, cell.set('cursors', cursors.delete(account_id)))
                    return false  # nothing further to do
                return

            # set new cursors
            info.get('locs').forEach (loc) =>
                id = loc.get('id')
                cell = cells.get(id)
                if not cell?
                    return
                cursors = cell.get('cursors') ? immutable.Map()
                loc = loc.set('time', info.get('time')).delete('id')
                locs = (cursors.get(account_id) ? immutable.List()).push(loc)
                cursors = cursors.set(account_id, locs)
                cell = cell.set('cursors', cursors)
                cells = cells.set(id, cell)
                return

        @_last_cursors = next_cursors

        if cells != cells_before
            @setState(cells : cells)

    _set: (obj, save=true) =>
        if @_state == 'closed'
            return
        # check write protection regarding specific keys to be set
        if (obj.type == 'cell') and (obj.id?) and (not @store.is_cell_editable(obj.id))
            for protected_key in ['input', 'cell_type', 'attachments']
                if misc.has_key(protected_key)
                    throw CellWriteProtectedException
        #@dbg("_set")("obj=#{misc.to_json(obj)}")
        @syncdb.set(obj, save)
        # ensure that we update locally immediately for our own changes.
        @_syncdb_change(immutable.fromJS([misc.copy_with(obj, ['id', 'type'])]))

    # might throw a CellDeleteProtectedException
    _delete: (obj, save=true) =>
        if @_state == 'closed'
            return
        # check: don't delete cells marked as deletable=false
        if obj.type == 'cell' and obj.id?
            if not @store.is_cell_deletable(obj.id)
                throw CellDeleteProtectedException
        @syncdb.delete(obj, save)
        @_syncdb_change(immutable.fromJS([{type:obj.type, id:obj.id}]))

    _sync: =>
        if @_state == 'closed'
            return
        @syncdb.sync()

    save: =>
        if @store.get('read_only')
            # can't save when readonly
            return
        if @store.get('mode') == 'edit'
            @_get_cell_input()
        # Saves our customer format sync doc-db to disk; the backend will
        # also save the normal ipynb file to disk right after.
        @syncdb.save () =>
            @set_save_status?()
        @set_save_status?()

    save_asap: =>
        @syncdb?.save_asap (err) =>
            if err
                setTimeout((()=>@syncdb?.save_asap()), 50)
        return

    _id_is_available: (id) =>
        return not @store.getIn(['cells', id])?

    _new_id: (is_available) =>
        is_available ?= @_id_is_available
        while true
            id = misc.uuid().slice(0,6)
            if is_available(id)
                return id

    insert_cell: (delta) =>  # delta = -1 (above) or +1 (below)
        pos = cell_utils.new_cell_pos(@store.get('cells'), @store.get('cell_list'), @store.get('cur_id'), delta)
        new_id = @_new_id()
        @_set
            type  : 'cell'
            id    : new_id
            pos   : pos
            input : ''
        @set_cur_id(new_id)
        return new_id  # violates CQRS... (this *is* used elsewhere)

    delete_selected_cells: (sync=true) =>
        selected = @store.get_selected_cell_ids_list()
        if selected.length == 0
            return
        id = @store.get('cur_id')
        @move_cursor_after(selected[selected.length-1])
        if @store.get('cur_id') == id
            @move_cursor_before(selected[0])
        not_deletable = 0
        for id in selected
            if not @store.is_cell_deletable(id)
                not_deletable += 1
            else
                @_delete({type:'cell', id:id}, false)
        if sync
            @_sync()
        if not_deletable > 0
            if selected.length == 1
                @show_delete_protection_error()
                @move_cursor_to_cell(id)
            else
                verb = if not_deletable == 1 then 'is' else 'are'
                @set_error("#{not_deletable} #{misc.plural(not_deletable, 'cell')} #{verb} protected from deletion.")
        return

    move_selected_cells: (delta) =>
        # Move all selected cells delta positions up or down, e.g., delta = +1 or delta = -1
        # This action changes the pos attributes of 0 or more cells.
        if delta == 0
            return
        v = @store.get('cell_list')?.toJS()
        w = cell_utils.move_selected_cells(v, @store.get_selected_cell_ids(), delta)
        if not w?
            return
        # now w is a complete list of the id's of the whole worksheet in the proper order; use it to set pos
        if underscore.isEqual(v, w)
            # no change
            return
        cells = @store.get('cells')
        changes = immutable.Set()
        for pos in [0...w.length]
            id = w[pos]
            if cells.get(id).get('pos') != pos
                @set_cell_pos(id, pos, false)
        @_sync()

    undo: =>
        @syncdb?.undo()
        return

    redo: =>
        @syncdb?.redo()
        return

    # in the future, might throw a CellWriteProtectedException. for now, just running is ok.
    run_cell: (id) =>
        cell = @store.getIn(['cells', id])
        if not cell?
            return

        @unselect_all_cells()  # for whatever reason, any running of a cell deselects in official jupyter

        cell_type = cell.get('cell_type') ? 'code'
        switch cell_type
            when 'code'
                code = @_get_cell_input(id).trim()
                cm_mode = @store.getIn(['cm_options', 'mode', 'name'])
                language = @store.getIn(['kernel_info', 'language'])
                switch parsing.run_mode(code, cm_mode, language)
                    when 'show_source'
                        @introspect(code.slice(0,code.length-2), 1)
                    when 'show_doc'
                        @introspect(code.slice(0,code.length-1), 0)
                    when 'empty'
                        @clear_cell(id)
                    when 'execute'
                        @run_code_cell(id)
            when 'markdown'
                @set_md_cell_not_editing(id)
        @save_asap()
        return

    run_code_cell: (id, save=true) =>
        # We mark the start timestamp uniquely, so that the backend can sort
        # multiple cells with a simultaneous time to start request.

        start = @_client.server_time() - 0
        if @_last_start? and start <= @_last_start
            start = @_last_start + 1
        @_last_start = start

        @_set
            type         : 'cell'
            id           : id
            state        : 'start'
            start        : start
            end          : null
            output       : null
            exec_count   : null
            collapsed    : null,
            save
        @set_trust_notebook(true)

    clear_cell: (id, save=true) =>
        return if @store.check_edit_protection(id, @)
        @_set
            type         : 'cell'
            id           : id
            state        : null
            start        : null
            end          : null
            output       : null
            exec_count   : null
            collapsed    : null,
            save

    run_selected_cells: =>
        v = @store.get_selected_cell_ids_list()
        for id in v
            @run_cell(id)
        @save_asap()

    # Run the selected cells, by either clicking the play button or
    # press shift+enter.  Note that this has somewhat weird/inconsitent
    # behavior in official Jupyter for usability reasons and due to
    # their "modal" approach.
    # In paricular, if the selections goes to the end of the document, we
    # create a new cell and set it the mode to edit; otherwise, we advance
    # the cursor and switch to escape mode.
    shift_enter_run_selected_cells: =>
        v = @store.get_selected_cell_ids_list()
        if v.length == 0
            return
        last_id = v[v.length-1]

        @run_selected_cells()

        cell_list = @store.get('cell_list')
        if cell_list?.get(cell_list.size-1) == last_id
            @set_cur_id(last_id)
            new_id = @insert_cell(1)
            # this is ugly, but I don't know a better way; when the codemirror editor of
            # the current cell unmounts, it blurs, which happens after right now.
            # So we just change the mode back to edit slightly in the future.
            setTimeout((()=>@set_cur_id(new_id); @set_mode('edit')), 1)
        else
            @set_mode('escape')
            @move_cursor(1)


    run_cell_and_insert_new_cell_below: =>
        v = @store.get_selected_cell_ids_list()
        @run_selected_cells()
        if @store.get('cur_id') in v
            new_id = @insert_cell(1)
        else
            new_id = @insert_cell(-1)
        # Set mode back to edit in the next loop since something above
        # sets it to escape.  See https://github.com/sagemathinc/cocalc/issues/2372
        f = =>
            @set_cur_id(new_id)
            @set_mode('edit')
            @scroll('cell visible')
        setTimeout(f, 0)

    run_all_cells: =>
        @store.get('cell_list').forEach (id) =>
            @run_cell(id)
            return
        @save_asap()

    # Run all cells strictly above the current cursor position.
    run_all_above: =>
        i = @store.get_cur_cell_index()
        if not i?
            return
        for id in @store.get('cell_list')?.toJS().slice(0, i)
            @run_cell(id)
        return

    # Run all cells below (and *including*) the current cursor position.
    run_all_below: =>
        i = @store.get_cur_cell_index()
        if not i?
            return
        for id in @store.get('cell_list')?.toJS().slice(i)
            @run_cell(id)
        return

    move_cursor_after_selected_cells: =>
        v = @store.get_selected_cell_ids_list()
        if v.length > 0
            @move_cursor_after(v[v.length-1])

    move_cursor_to_last_selected_cell: =>
        v = @store.get_selected_cell_ids_list()
        if v.length > 0
            @set_cur_id(v[v.length-1])

    # move cursor delta positions from current position
    move_cursor: (delta) =>
        @set_cur_id_from_index(@store.get_cur_cell_index() + delta)
        return

    move_cursor_after: (id) =>
        i = @store.get_cell_index(id)
        if not i?
            return
        @set_cur_id_from_index(i + 1)
        return

    move_cursor_before: (id) =>
        i = @store.get_cell_index(id)
        if not i?
            return
        @set_cur_id_from_index(i - 1)
        return

    move_cursor_to_cell: (id) =>
        i = @store.get_cell_index(id)
        if not i?
            return
        @set_cur_id_from_index(i)
        return

    set_cursor_locs: (locs=[], side_effect) =>
        if locs.length == 0
            # don't remove on blur -- cursor will fade out just fine
            return
        @_cursor_locs = locs  # remember our own cursors for splitting cell
        # syncdb not always set -- https://github.com/sagemathinc/cocalc/issues/2107
        @syncdb?.set_cursor_locs(locs, side_effect)

    split_current_cell: =>
        cursor = @_cursor_locs?[0]
        if not cursor?
            return
        cur_id = @store.get('cur_id')
        if cursor.id != cur_id
            # cursor isn't in currently selected cell, so don't know how to split
            return
        return if @store.check_edit_protection(cur_id, @)
        # insert a new cell before the currently selected one
        new_id = @insert_cell(-1)

        # split the cell content at the cursor loc
        cell = @store.get('cells').get(cursor.id)
        if not cell?
            return  # this would be a bug?
        cell_type = cell.get('cell_type')
        if cell_type != 'code'
            @set_cell_type(new_id, cell_type)
            # newly inserted cells are always editable
            @set_md_cell_editing(new_id)
        input = cell.get('input')
        if not input?
            return

        lines  = input.split('\n')
        v      = lines.slice(0, cursor.y)
        line   = lines[cursor.y]
        left = line.slice(0, cursor.x)
        if left
            v.push(left)
        top = v.join('\n')

        v     = lines.slice(cursor.y+1)
        right = line.slice(cursor.x)
        if right
            v = [right].concat(v)
        bottom = v.join('\n')
        @set_cell_input(new_id, top, false)
        @set_cell_input(cursor.id, bottom, true)
        @set_cur_id(cursor.id)

    # Copy content from the cell below the current cell into the currently
    # selected cell, then delete the cell below the current cell.s
    merge_cell_below: (save=true) =>
        cur_id = @store.get('cur_id')
        if not cur_id?
            return
        next_id = @store.get_cell_id(1)
        if not next_id?
            return
        for cell_id in [cur_id, next_id]
            if not @store.is_cell_editable(cur_id)
                @set_error('Cells protected from editing cannot be merged.')
                return
            if not @store.is_cell_deletable(cur_id)
                @set_error('Cells protected from deletion cannot be merged.')
                return
        cells = @store.get('cells')
        if not cells?
            return
        input  = (cells.get(cur_id)?.get('input') ? '') + '\n' + (cells.get(next_id)?.get('input') ? '')

        output = undefined
        output0 = cells.get(cur_id)?.get('output')
        output1 = cells.get(next_id)?.get('output')
        if not output0?
            output = output1
        else if not output1?
            output = output0
        else
            # both output0 and output1 are defined; need to merge.
            # This is complicated since output is a map from string numbers.
            output = output0
            n = output0.size
            for i in [0...output1.size]
                output = output.set("#{n}", output1.get("#{i}"))
                n += 1

        # we checked above that cell is deletable
        @_delete({type:'cell', id:next_id}, false)
        @_set
            type   : 'cell'
            id     : cur_id
            input  : input
            output : output ? null
            start  : null
            end    : null,
            save
        return

    merge_cell_above: =>
        @move_cursor(-1)
        @merge_cell_below()
        return

    # Merge all selected cells into one cell.
    # We also merge all output, instead of throwing away
    # all but first output (which jupyter does, and makes no sense).
    merge_cells: =>
        v = @store.get_selected_cell_ids_list()
        n = v?.length
        if not n? or n <= 1
            return
        @set_cur_id(v[0])
        for i in [0...n-1]
            @merge_cell_below(i == n-2)

    # Copy all currently selected cells into our internal clipboard
    copy_selected_cells: =>
        cells = @store.get('cells')
        global_clipboard = immutable.List()
        for id in @store.get_selected_cell_ids_list()
            global_clipboard = global_clipboard.push(cells.get(id))
        @store.set_global_clipboard(global_clipboard)
        return

    # Cut currently selected cells, putting them in internal clipboard
    cut_selected_cells: =>
        @copy_selected_cells()
        @delete_selected_cells()

    # write protection disables any modifications, entering "edit" mode, and prohibits cell evaluations
    # example: teacher handout notebook and student should not be able to modify an instruction cell in any way
    toggle_write_protection: =>
        # also make sure to switch to escape mode and eval markdown cells
        @set_mode('escape')
        f = (id) =>
            type = @store.getIn(['cells', id, 'cell_type'])
            if type == 'markdown'
                @set_md_cell_not_editing(id)
        @toggle_metadata_boolean('editable', f)

    # this prevents any cell from being deleted, either directly, or indirectly via a "merge"
    # example: teacher handout notebook and student should not be able to modify an instruction cell in any way
    toggle_delete_protection: =>
        @toggle_metadata_boolean('deletable')

    show_edit_protection_error: =>
        @set_error("This cell is protected from editing.")

    show_delete_protection_error: =>
        @set_error("This cell is protected from deletion.")

    # This toggles the boolean value of given metadata field.
    # If not set, it is assumed to be true and toggled to false
    # For more than one cell, the first one is used to toggle all cells to the inverted state
    toggle_metadata_boolean: (key, extra_processing) =>
        new_value = undefined
        for id in @store.get_selected_cell_ids_list()
            if not new_value?
                current_value = @store.getIn(['cells', id, 'metadata', key]) ? true
                new_value = not current_value
            extra_processing?(id)
            @set_cell_metadata(
                id        : id
                metadata  : {"#{key}": new_value}
                merge     : true
                save      : true
            )
        @save_asap()

    # Paste cells from the internal clipboard; also
    #   delta = 0 -- replace currently selected cells
    #   delta = 1 -- paste cells below last selected cell
    #   delta = -1 -- paste cells above first selected cell
    paste_cells: (delta=1) =>
        cells = @store.get('cells')
        v = @store.get_selected_cell_ids_list()
        if v.length == 0
            return # no selected cells
        if delta == 0 or delta == -1
            cell_before_pasted_id = @store.get_cell_id(-1, v[0])  # one before first selected
        else if delta == 1
            cell_before_pasted_id = v[v.length-1]                 # last selected
        else
            console.warn("paste_cells: invalid delta=#{delta}")
            return
        try
            if delta == 0
                # replace, so delete currently selected, unless just the cursor, since
                # cursor vs selection is confusing with Jupyer's model.
                if v.length > 1
                    @delete_selected_cells(false)
            clipboard = @store.get_global_clipboard()
            if not clipboard? or clipboard.size == 0
                return   # nothing more to do
            # put the cells from the clipboard into the document, setting their positions
            if not cell_before_pasted_id?
                # very top cell
                before_pos = undefined
                after_pos  = cells.getIn([v[0], 'pos'])
            else
                before_pos = cells.getIn([cell_before_pasted_id, 'pos'])
                after_pos  = cells.getIn([@store.get_cell_id(+1, cell_before_pasted_id), 'pos'])
            positions = cell_utils.positions_between(before_pos, after_pos, clipboard.size)
            clipboard.forEach (cell, i) =>
                cell = cell.set('id', @_new_id())   # randomize the id of the cell
                cell = cell.set('pos', positions[i])
                @_set(cell, false)
                return
        finally
            # very important that we save whatever is done above, so other viewers see it.
            @_sync()

    toggle_toolbar: =>
        @set_toolbar_state(not @store.get('toolbar'))

    set_toolbar_state: (val) =>  # val = true = visible
        @setState(toolbar: val)
        @set_local_storage('hide_toolbar', not val)

    toggle_header: =>
        @redux?.getActions('page').toggle_fullscreen()

    set_header_state: (val) =>
        @redux?.getActions('page').set_fullscreen(val)

    set_line_numbers: (show) =>
        @set_local_storage('line_numbers', !!show)
        # unset the line_numbers property from all cells
        cells = @store.get('cells').map((cell) -> cell.delete('line_numbers'))
        if not cells.equals(@store.get('cells'))
            # actually changed
            @setState(cells: cells)
        # now cause cells to update
        @set_cm_options()
        return

    toggle_line_numbers: =>
        @set_line_numbers(not @store.get_local_storage('line_numbers'))

    toggle_cell_line_numbers: (id) =>
        cells = @store.get('cells')
        cell = cells.get(id)
        if not cell?
            return
        line_numbers = cell.get('line_numbers') ? @store.get_local_storage('line_numbers') ? false
        @setState(cells: cells.set(id, cell.set('line_numbers', not line_numbers)))

    # zoom in or out delta font sizes
    set_font_size: (pixels) =>
        @setState
            font_size : pixels
        # store in localStorage
        @set_local_storage('font_size', pixels)

    set_local_storage: (key, value) =>
        if localStorage?
            current = localStorage[@name]
            if current?
                current = misc.from_json(current)
            else
                current = {}
            if value == null
                delete current[key]
            else
                current[key] = value
            localStorage[@name] = misc.to_json(current)

    zoom: (delta) =>
        @set_font_size(@store.get('font_size') + delta)

    set_scroll_state: (state) =>
        @set_local_storage('scroll', state)

    # File --> Open: just show the file listing page.
    file_open: =>
        @redux?.getProjectActions(@store.get('project_id')).set_active_tab('files')
        return

    file_new: =>
        @redux?.getProjectActions(@store.get('project_id')).set_active_tab('new')
        return

    register_input_editor: (id, editor) =>
        @_input_editors ?= {}
        @_input_editors[id] = editor
        return

    unregister_input_editor: (id) =>
        delete @_input_editors?[id]

    # Meant to be used for implementing actions -- do not call externally
    _get_cell_input: (id) =>
        id ?= @store.get('cur_id')
        return (@_input_editors?[id]?.save?() ? @store.getIn(['cells', id, 'input']) ? '')

    # Press tab key in editor of currently selected cell.
    tab_key: =>
        @_input_editors?[@store.get('cur_id')]?.tab_key?()

    set_cursor: (id, pos) =>
        ###
        id = cell id
        pos = {x:?, y:?} coordinates in a cell

        use y=-1 for last line.
        ###
        @_input_editors?[id]?.set_cursor?(pos)
        return

    set_kernel: (kernel) =>
        if @store.get('kernel') != kernel
            @_set
                type     : 'settings'
                kernel   : kernel

    show_history_viewer: () =>
        @redux.getProjectActions(@store.get('project_id'))?.open_file
            path       : misc.history_path(@store.get('path'))
            foreground : true

    # Attempt to fetch completions for give code and cursor_pos
    # If successful, the completions are put in store.get('completions') and looks like
    # this (as an immutable map):
    #    cursor_end   : 2
    #    cursor_start : 0
    #    matches      : ['the', 'completions', ...]
    #    status       : "ok"
    #    code         : code
    #    cursor_pos   : cursor_pos
    #
    # If not successful, result is:
    #    status       : "error"
    #    code         : code
    #    cursor_pos   : cursor_pos
    #    error        : 'an error message'
    #
    # Only the most recent fetch has any impact, and calling
    # clear_complete() ensures any fetch made before that
    # is ignored.
    complete: (code, pos, id, offset) =>
        req = @_complete_request = (@_complete_request ? 0) + 1

        @setState(complete: undefined)

        # pos can be either a {line:?, ch:?} object as in codemirror,
        # or a number.
        if misc.is_object(pos)
            lines = code.split('\n')
            cursor_pos = misc.sum(lines[i].length+1 for i in [0...pos.line]) + pos.ch
        else
            cursor_pos = pos

        @_ajax
            url     : server_urls.get_complete_url(@store.get('project_id'), @store.get('path'), code, cursor_pos)
            timeout : 5000
            cb      : (err, data) =>
                if @_complete_request > req
                    # future completion or clear happened; so ignore this result.
                    return
                if err or data?.status != 'ok'
                    @setState(complete: {error  : err ? 'completion failed'})
                    return
                complete = data
                delete complete.status
                complete.base = code
                complete.code = code
                complete.pos  = cursor_pos
                complete.id   = id
                # Set the result so the UI can then react to the change.
                if offset?
                    complete.offset = offset
                @setState(complete: immutable.fromJS(complete))
                if complete?.matches?.length == 1 and id?
                    # special case -- a unique completion and we know id of cell in which completing is given
                    @select_complete(id, complete.matches[0])
        return

    clear_complete: =>
        @_complete_request = (@_complete_request ? 0) + 1
        @setState(complete: undefined)

    select_complete: (id, item) =>
        complete = @store.get('complete')
        @clear_complete()
        @set_mode('edit')
        if not complete?
            return
        input = complete.get('code')
        if input? and not complete.get('error')?
            new_input = input.slice(0, complete.get('cursor_start')) + item + input.slice(complete.get('cursor_end'))
            # We don't actually make the completion until the next render loop,
            # so that the editor is already in edit mode.  This way the cursor is
            # in the right position after making the change.
            setTimeout((=> @merge_cell_input(id, complete.get('base'), new_input)), 0)

    merge_cell_input: (id, base, input, save=true) =>
        remote = @store.getIn(['cells', id, 'input'])
        # console.log 'merge', "'#{base}'", "'#{input}'", "'#{remote}'"
        if not remote? or not base? or not input?
            return
        new_input = syncstring.three_way_merge
            base   : base
            local  : input
            remote : remote
        @set_cell_input(id, new_input, save)
        return

    complete_handle_key: (keyCode) =>
        ###
        User presses a key while the completions dialog is open.
        ###
        complete = @store.get('complete')
        if not complete?
            return
        c                     = String.fromCharCode(keyCode)
        complete              = complete.toJS()  # code is ugly without just doing this - doesn't matter for speed
        code                  = complete.code
        pos                   = complete.pos
        complete.code         = code.slice(0, pos) + c + code.slice(pos)
        complete.cursor_end  += 1
        complete.pos         += 1
        target                = complete.code.slice(complete.cursor_start, complete.cursor_end)
        complete.matches      = (x for x in complete.matches when misc.startswith(x, target))
        if complete.matches.length == 0
            @clear_complete()
            @set_mode('edit')
        else
            @merge_cell_input(complete.id, complete.base, complete.code)
            complete.base = complete.code
            @setState(complete : immutable.fromJS(complete))
        return

    introspect: (code, level, cursor_pos) =>
        req = @_introspect_request = (@_introspect_request ? 0) + 1

        @setState(introspect: undefined)

        cursor_pos ?= code.length

        @_ajax
            url     : server_urls.get_introspect_url(@store.get('project_id'), @store.get('path'), code, cursor_pos, level)
            timeout : 30000
            cb      : (err, data) =>
                if @_introspect_request > req
                    # future completion or clear happened; so ignore this result.
                    return
                if err
                    introspect = {error  : err}
                else
                    introspect = data
                    if introspect.status != 'ok'
                        introspect = {error:'completion failed'}
                    delete introspect.status

                @setState(introspect: immutable.fromJS(introspect))
        return

    clear_introspect: =>
        @_introspect_request = (@_introspect_request ? 0) + 1
        @setState(introspect: undefined)

    signal: (signal='SIGINT') =>
        @_ajax
            url     : server_urls.get_signal_url(@store.get('project_id'), @store.get('path'), signal)
            timeout : 5000
        return

    set_backend_kernel_info: =>
        if @store.get('backend_kernel_info')?
            return

        if @_is_project
            dbg = @dbg("set_backend_kernel_info #{misc.uuid()}")
            if not @_jupyter_kernel?
                dbg("not defined")
                return
            dbg("calling kernel_info...")
            @_jupyter_kernel.kernel_info
                cb : (err, data) =>
                    if not err
                        dbg("got data='#{misc.to_json(data)}'")
                        @setState(backend_kernel_info: data)
                    else
                        dbg("error = #{err}")
            return

        if @_fetching_backend_kernel_info
            return
        @_fetching_backend_kernel_info = true
        f = (cb) =>
            if @_state == 'closed'
                cb()
            @_ajax
                url     : server_urls.get_kernel_info_url(@store.get('project_id'), @store.get('path'))
                timeout : 15000
                cb      : (err, data) =>
                    if err
                        #console.log("Error setting backend kernel info -- #{err}")
                        cb(true)
                    else if data.error?
                        #console.log("Error setting backend kernel info -- #{data.error}")
                        cb(true)
                    else
                        # success
                        @setState(backend_kernel_info: immutable.fromJS(data))
                        # this is when the server for this doc started, not when kernel last started!
                        @setState(start_time : data.start_time)
                        # Update the codemirror editor options.
                        @set_cm_options()
                        cb()

        misc.retry_until_success
            f           : f
            max_time    : 60000
            start_delay : 1000
            max_delay   : 10000
            cb          : (err) =>
                @_fetching_backend_kernel_info = false

    # Do a file action, e.g., 'compress', 'delete', 'rename', 'duplicate', 'move',
    # 'copy', 'share', 'download', 'open_file', 'close_file', 'reopen_file'
    # Each just shows
    # the corresponding dialog in
    # the file manager, so gives a step to confirm, etc.
    # The path may optionally be *any* file in this project.
    file_action: (action_name, path) =>
        a = @redux.getProjectActions(@store.get('project_id'))
        path ?= @store.get('path')
        if action_name == 'reopen_file'
            a.close_file(path)
            # ensure the side effects from changing registered
            # editors in project_file.coffee finish happening
            window.setTimeout =>
                a.open_file(path: path)
            , 0
            return
        if action_name == 'close_file'
            @syncdb.save () =>
                a.close_file(path)
            return
        if action_name == 'open_file'
            a.open_file(path: path)
            return
        {head, tail} = misc.path_split(path)
        a.open_directory(head)
        a.set_all_files_unchecked()
        a.set_file_checked(path, true)
        a.set_file_action(action_name, -> tail)

    show_about: =>
        @setState(about:true)
        @set_backend_kernel_info()

    focus: (wait) =>
        #console.log 'focus', wait, (new Error()).stack
        if @_state == 'closed'
            return
        if @_blur_lock
            return
        if wait
            setTimeout(@focus, 1)
        else
            @setState(is_focused: true)

    blur: (wait) =>
        if @_state == 'closed'
            return
        if wait
            setTimeout(@blur, 1)
        else
            @setState
                is_focused : false
                mode       : 'escape'

    blur_lock: =>
        @blur()
        @_blur_lock = true

    focus_unlock: =>
        @_blur_lock = false
        @focus()

    set_max_output_length: (n) =>
        @_set
            type              : 'settings'
            max_output_length : n

    fetch_more_output: (id) =>
        time = @_client.server_time() - 0
        @_ajax
            url     : server_urls.get_more_output_url(@store.get('project_id'), @store.get('path'), id)
            timeout : 60000
            cb      : (err, more_output) =>
                if err
                    @set_error(err)
                else
                    if not @store.getIn(['cells', id, 'scrolled'])
                        # make output area scrolled, since there is going to be a lot of output
                        @toggle_output(id, 'scrolled')
                    @set_more_output(id, {time:time, mesg_list:more_output})

    set_more_output: (id, more_output) =>
        if not @store.getIn(['cells', id])?
            return
        x = @store.get('more_output') ? immutable.Map()
        @setState(more_output : x.set(id, immutable.fromJS(more_output)))

    reset_more_output: (id) =>
        more_output = @store.get('more_output') ? immutable.Map()
        if more_output.has(id)
            @setState(more_output : more_output.delete(id))

    set_cm_options: =>
        mode = @store.get_cm_mode()
        editor_settings  = @redux.getStore('account')?.get('editor_settings')?.toJS?()
        line_numbers = @store.get_local_storage('line_numbers')
        read_only = @store.get('read_only')
        x = immutable.fromJS
            options  : cm_options(mode, editor_settings, line_numbers, read_only)
            markdown : cm_options({name:'gfm2'}, editor_settings, line_numbers, read_only)

        if not x.equals(@store.get('cm_options'))  # actually changed
            @setState(cm_options: x)

    show_find_and_replace: =>
        @blur_lock()
        @setState(find_and_replace:true)

    close_find_and_replace: =>
        @setState(find_and_replace:false)
        @focus_unlock()

    show_keyboard_shortcuts: =>
        @blur_lock()
        @setState(keyboard_shortcuts:{show:true})

    close_keyboard_shortcuts: =>
        @setState(keyboard_shortcuts:undefined)
        @focus_unlock()

    show_code_assistant: =>
        return if not @assistant_actions?
        @blur_lock()

        # special case: sage is language "python", but the assistant needs "sage"
        if misc.startswith(@store.get('kernel'), 'sage')
            lang = 'sage'
        else
            lang = @store.getIn(['kernel_info', 'language'])

        @assistant_actions.init(lang)
        @assistant_actions.set(
            show            : true
            lang            : lang
            lang_select     : false
            handler         : @code_assistant_handler
        )

    code_assistant_handler: (data) =>
        @focus_unlock()
        {code, descr} = data
        #if DEBUG then console.log("assistant data:", data, code, descr)

        if descr?
            descr_cell = @insert_cell(1)
            @set_cell_input(descr_cell, descr)
            @set_cell_type(descr_cell, cell_type='markdown')

        code_cell = @insert_cell(1)
        @set_cell_input(code_cell, code)
        @run_code_cell(code_cell)
        @scroll('cell visible')

    _keyboard_settings: =>
        if not @_account_change_editor_settings?
            console.warn("account settings not loaded")  # should not happen
            return
        k = @_account_change_editor_settings.get('jupyter_keyboard_shortcuts')
        if k?
            return JSON.parse(k)
        else
            return {}

    add_keyboard_shortcut: (name, shortcut) =>
        k = @_keyboard_settings()
        if not k?
            return
        v = k[name] ? []
        for x in v
            if underscore.isEqual(x, shortcut)
                return
        v.push(shortcut)
        k[name] = v
        @_set_keyboard_settings(k)

    _set_keyboard_settings: (k) =>
        @redux.getTable('account').set(editor_settings: {jupyter_keyboard_shortcuts : JSON.stringify(k)})

    delete_keyboard_shortcut: (name, shortcut) =>
        k = @_keyboard_settings()
        if not k?
            return
        v = k[name] ? []
        w = (x for x in v when not underscore.isEqual(x, shortcut))
        if w.length == v.length
            # must be removing a default shortcut
            v.push(misc.merge_copy(shortcut, {remove:true}))
        k[name] = v
        @_set_keyboard_settings(k)

    # Display a confirmation dialog, then call opts.cb with the choice.
    # See confirm-dialog.cjsx for options.
    confirm_dialog: (opts) =>
        @blur_lock()
        @setState(confirm_dialog : opts)
        @store.wait
            until   : (state) =>
                c = state.get('confirm_dialog')
                if not c?  # deleting confirm_dialog prop is same as cancelling.
                    return 'cancel'
                else
                    return c.get('choice')
            timeout : 0
            cb      : (err, choice) =>
                @focus_unlock()
                opts.cb(choice)

    close_confirm_dialog: (choice) =>
        if not choice?
            @setState(confirm_dialog: undefined)
        else
            confirm_dialog = @store.get('confirm_dialog')
            if confirm_dialog?
                @setState(confirm_dialog: confirm_dialog.set('choice', choice))

    trust_notebook: =>
        @confirm_dialog
            icon    : 'warning'
            title   : 'Trust this Notebook?'
            body    : 'A trusted Jupyter notebook may execute hidden malicious Javascript code when you open it. Selecting trust below, or evaluating any cell, will immediately execute any Javascript code in this notebook now and henceforth. (NOTE: CoCalc does NOT implement the official Jupyter security model for trusted notebooks; in particular, we assume that you do trust collaborators on your CoCalc projects.)'
            choices : [{title:'Trust', style:'danger', default:true}, {title:'Cancel'}]
            cb      : (choice) =>
                if choice == 'Trust'
                    @set_trust_notebook(true)

    set_trust_notebook: (trust) =>
        @_set
            type  : 'settings'
            trust : !!trust  # case to bool

    insert_image: =>
        @setState(insert_image: true)

    command: (name) =>
        f = @_commands?[name]?.f
        if f?
            f()
        else
            @set_error("Command '#{name}' is not implemented")
        return

    # if cell is being edited, use this to move the cursor *in that cell*
    move_edit_cursor: (delta) =>
        @set_error('move_edit_cursor not implemented')

    # supported scroll positions are in commands.coffee
    scroll: (pos) =>
        @setState(scroll: pos)

    # submit input for a particular cell -- this is used by the
    # Input component output message type for interactive input.
    submit_input: (id, value) =>
        output = @store.getIn(['cells', id, 'output'])
        if not output?
            return
        n = "#{output.size - 1}"
        mesg = output.get(n)
        if not mesg?
            return

        if mesg.getIn(['opts', 'password'])
            # handle password input separately by first submitting to the backend.
            @submit_password id, value, () =>
                value = ('●' for i in [0...value.length]).join('')
                @set_cell_output(id, output.set(n, mesg.set('value', value)), false)
                @save_asap()
            return

        @set_cell_output(id, output.set(n, mesg.set('value', value)), false)
        @save_asap()

    submit_password: (id, value, cb) =>
        @set_in_backend_key_value_store(id, value, cb)

    set_in_backend_key_value_store: (key, value, cb) =>
        @_ajax
            url     : server_urls.get_store_url(@store.get('project_id'), @store.get('path'), key, value)
            timeout : 15000
            cb      : (err) =>
                if @_state == 'closed'
                    return
                if err
                    @set_error("Error setting backend key/value store (#{err})")
                cb?(err)

    set_to_ipynb: (ipynb, data_only=false) =>
        ###
        set_to_ipynb - set from ipynb object.  This is
        mainly meant to be run on the backend in the project,
        but is also run on the frontend too, e.g.,
        for client-side nbviewer (in which case it won't remove images, etc.).

        See the documentation for load_ipynb_file in project-actions.coffee for
        documentation about the data_only input variable.
        ###
        #dbg = @dbg("set_to_ipynb")
        @_state = 'load'

        #dbg(misc.to_json(ipynb))

        # We have to parse out the kernel so we can use process_output below.
        # (TODO: rewrite so process_output is not associated with a specific kernel)
        kernel = ipynb.metadata?.kernelspec?.name ? DEFAULT_KERNEL   # very like to work since official ipynb file without this kernelspec is invalid.
        #dbg("kernel in ipynb: name='#{kernel}'")

        if data_only
            trust = undefined
            set = ->
        else
            @reset_more_output?()  # clear the more output handler (only on backend)
            @syncdb.delete(undefined, false)  # completely empty database
            # preserve trust state across file updates/loads
            trust = @store.get('trust')
            set = (obj) =>
                @syncdb.set(obj, false)

        set({type: 'settings', kernel: kernel})
        @ensure_backend_kernel_setup?()

        importer = new IPynbImporter()

        # NOTE: Below we re-use any existing ids to make the patch that defines changing
        # to the contents of ipynb more efficient.   In case of a very slight change
        # on disk, this can be massively more efficient.

        importer.import
            ipynb              : ipynb
            existing_ids       : @store.get('cell_list')?.toJS()
            new_id             : @_new_id
            process_attachment : @_jupyter_kernel?.process_attachment
            output_handler     : @_output_handler   # undefined in client; defined in project

        if data_only
            importer.close()
            return

        # Set all the cells
        for _, cell of importer.cells()
            set(cell)

        # Set the settings
        set({type: 'settings', kernel: importer.kernel(), trust:trust})

        # Set extra user-defined metadata
        metadata = importer.metadata()
        if metadata?
            set({type: 'settings', metadata: metadata})

        importer.close()

        @syncdb.sync () =>
            @ensure_backend_kernel_setup?()
            @_state = 'ready'

    nbconvert: (args) =>
        if @store.getIn(['nbconvert', 'state']) in ['start', 'run']
            # not allowed
            return
        @syncdb.set
            type  : 'nbconvert'
            args  : args
            state : 'start'
            error : null

    show_nbconvert_dialog: (to) =>
        if not to?
            # use last or a default
            args = @store.getIn(['nbconvert', 'args'])
            if args?
                for i in [0...args.length-1]
                    if args[i] == '--to'
                        to = args[i+1]
        to ?= 'html'
        @setState(nbconvert_dialog: {to:to})
        if @store.getIn(['nbconvert', 'state']) not in ['start', 'run']
            # start it
            @nbconvert(['--to', to])

    nbconvert_get_error: =>
        key = @store.getIn(['nbconvert', 'error', 'key'])
        if not key?
            return
        @_ajax
            url     : server_urls.get_store_url(@store.get('project_id'), @store.get('path'), key)
            timeout : 10000
            cb      : (err, value) =>
                if @_state == 'closed'
                    return
                nbconvert = @store.get('nbconvert')
                if nbconvert.getIn(['error', 'key']) == key
                    @setState(nbconvert : nbconvert.set('error', value))

    cell_toolbar: (name) =>
        # Set which cell toolbar is visible.  At most one may be visible.
        # name=undefined to not show any.
        @setState(cell_toolbar: name)

    set_cell_slide: (id, value) =>
        if not value
            value = null  # delete
        return if @store.check_edit_protection(id, @)
        @_set
            type  : 'cell'
            id    : id
            slide : value

    ensure_positions_are_unique: =>
        changes = cell_utils.ensure_positions_are_unique(@store.get('cells'))
        if changes?
            for id, pos of changes
                @set_cell_pos(id, pos, false)
        @_sync()

    set_default_kernel: (kernel) =>
        if @_is_project  # doesn't make sense for project (right now at least)
            return
        s = @redux.getStore('account')
        if not s?
            return
        cur = s.getIn(['editor_settings', 'jupyter'])?.toJS() ? {}
        cur.kernel = kernel
        @redux.getTable('account').set(editor_settings:{jupyter: cur})
        return

    edit_attachments: (id) =>
        @setState(edit_attachments: id)

    _attachment_markdown: (name) =>
        return "![#{name}](attachment:#{name})"

    insert_input_at_cursor: (id, s, save) =>
        if not @store.getIn(['cells', id])?
            return
        return if @store.check_edit_protection(id, @)
        input   = @_get_cell_input(id)
        cursor  = @_cursor_locs?[0]
        if cursor?.id == id
            v = input.split('\n')
            line = v[cursor.y]
            v[cursor.y] = line.slice(0, cursor.x) + s + line.slice(cursor.x)
            input = v.join('\n')
        else
            input  += s
        @_set({type:'cell', id:id, input:input}, save)

    # Sets attachments[name] = val
    set_cell_attachment: (id, name, val, save=true) =>
        cell = @store.getIn(['cells', id])
        if not cell?
            # no such cell
            return
        return if @store.check_edit_protection(id, @)
        attachments = cell.get('attachments')?.toJS() ? {}
        attachments[name] = val
        @_set
            type        : 'cell'
            id          : id
            attachments : attachments,
            save

    add_attachment_to_cell: (id, path) =>
        return if @store.check_edit_protection(id, @)
        name = misc.path_split(path).tail
        name = name.toLowerCase()
        name = encodeURIComponent(name).replace(/\(/g, "%28").replace(/\)/g, "%29")
        @set_cell_attachment(id, name, {type:'load', value:path})
        @store.wait
            until : =>
                return @store.getIn(['cells', id, 'attachments', name, 'type']) == 'sha1'
            cb    : =>
                # This has to happen in the next render loop, since changing immediately
                # can update before the attachments props are updated.
                setTimeout((=>@insert_input_at_cursor(id, @_attachment_markdown(name), true)), 10)
        return

    delete_attachment_from_cell: (id, name) =>
        return if @store.check_edit_protection(id, @)
        @set_cell_attachment(id, name, null, false)
        @set_cell_input(id, misc.replace_all(@_get_cell_input(id), @_attachment_markdown(name), ''))

    add_tag: (id, tag, save=true) =>
        return if @store.check_edit_protection(id, @)
        @_set
            type  : 'cell'
            id    : id
            tags  : {"#{tag}":true},
            save

    remove_tag: (id, tag, save=true) =>
        return if @store.check_edit_protection(id, @)
        @_set
            type  : 'cell'
            id    : id
            tags  : {"#{tag}":null},
            save

    set_view_mode: (mode) =>
        @setState(view_mode: mode)
        if mode == 'raw'
            @set_raw_ipynb()

    edit_cell_metadata: (id) =>
        metadata = @store.getIn(['cells', id, 'metadata']) ? immutable.Map()
        @blur_lock()
        @setState(edit_cell_metadata: {id: id, metadata:metadata})

    set_cell_metadata: (opts) =>
        ###
        Sets the metadata to exactly the metadata object.  It doesn't just merge it in.
        ###
        {id, metadata, save, merge} = opts = defaults opts,
            id       : required
            metadata : required
            save     : true
            merge    : false

        # Special case: delete metdata (unconditionally)
        if not metadata? or misc.len(metadata) == 0
            @_set
                type     : 'cell'
                id       : id
                metadata : null,
                save
            return

        if merge
            current  = @store.getIn(['cells', id, 'metadata']) ? immutable.Map()
            metadata = current.merge(metadata)

        # special fields
        # "collapsed", "scrolled", "slideshow", and "tags"
        if metadata.tags?
            for tag in metadata.tags
                @add_tag(id, tag, false)
            delete metadata.tags
        # important to not store redundant inconsistent fields:
        for field in ['collapsed', 'scrolled', 'slideshow']
            if metadata[field]?
                delete metadata[field]

        # first delete
        @_set
            type     : 'cell'
            id       : id
            metadata : null,
            false
        # then set
        @_set
            type     : 'cell'
            id       : id
            metadata : metadata,
            save
        if @store.getIn(['edit_cell_metadata', 'id']) == id
            @edit_cell_metadata(id)  # updates the state while editing

    set_raw_ipynb: =>
        if @_state == 'load'
            return
        @setState(raw_ipynb: immutable.fromJS(@store.get_ipynb()))

    switch_to_classical_notebook: =>
        @confirm_dialog
            title   : 'Switch to the Classical Notebook?'
            body    : 'If you are having trouble with the the CoCalc Jupyter Notebook, you can switch to the Classical Jupyter Notebook.   You can always switch back to the CoCalc Jupyter Notebook easily later from Jupyter or account settings (and please let us know what is missing so we can add it!).\n\n---\n\n**WARNING:** Multiple people simultaneously editing a notebook, with some using classical and some using the new mode, will NOT work!  Switching back and forth will likely also cause problems (use TimeTravel to recover).  *Please avoid using classical notebook mode if you possibly can!*\n\n[More info and the latest status...](https://github.com/sagemathinc/cocalc/wiki/JupyterClassicModern)'
            choices : [{title:'Switch to Classical Notebook', style:'warning'}, {title:'Continue using CoCalc Jupyter Notebook', default:true}]
            cb      : (choice) =>
                if choice != 'Switch to Classical Notebook'
                    return
                @redux.getTable('account').set(editor_settings: {jupyter_classic : true})
                @save()
                @file_action('reopen_file', @store.get('path'))

    close_and_halt: =>
        # Kill running session
        @signal('SIGKILL')
        # Display the main file listing page
        @file_open()
        # Close the file
        @file_action('close_file')
