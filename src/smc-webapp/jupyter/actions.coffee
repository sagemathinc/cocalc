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

{Actions}  = require('../smc-react')

util       = require('./util')

{cm_options} = require('./cm_options')

jupyter_kernels = undefined

###
The actions -- what you can do with a jupyter notebook, and also the
underlying synchronized state.
###

class exports.JupyterActions extends Actions

    _init: (project_id, path, syncdb, store, client) =>
        @util = util # TODO: for debugging only
        @_state      = 'init'   # 'init', 'load', 'ready', 'closed'
        @store       = store
        store.syncdb = syncdb
        @syncdb      = syncdb
        @_client     = client
        @_is_project = client.is_project()  # the project client is designated to manage execution/conflict, etc.
        @_account_id = client.client_id()   # project or account's id

        @setState
            error               : undefined
            cur_id              : @store.get_local_storage('cur_id')
            toolbar             : true
            has_unsaved_changes : true
            sel_ids             : immutable.Set()  # immutable set of selected cells
            md_edit_ids         : immutable.Set()  # set of ids of markdown cells in edit mode
            mode                : 'escape'
            cm_options          : cm_options()
            font_size           : @store.get_local_storage('font_size') ? @redux.getStore('account')?.get('font_size') ? 14
            project_id          : project_id
            directory           : misc.path_split(path)?.head
            path                : path

        f = () =>
            @setState(has_unsaved_changes : @syncdb?.has_unsaved_changes())
            setTimeout((=>@setState(has_unsaved_changes : @syncdb?.has_unsaved_changes())), 3000)
        @set_has_unsaved_changes = underscore.debounce(f, 1500)

        @syncdb.on('metadata-change', @set_has_unsaved_changes)
        @syncdb.on('change', @_syncdb_change)

        if not client.is_project() # project doesn't care about cursors
            @syncdb.on('cursor_activity', @_syncdb_cursor_activity)

        if not client.is_project() and window?.$?
            # frontend browser client with jQuery
            @set_jupyter_kernels()  # must be after setting project_id above.

    dbg: (f) =>
        return @_client.dbg("Jupyter('#{@store.get('path')}').#{f}")

    close: =>
        if @_state == 'closed'
            return
        @set_local_storage('cur_id', @store.get('cur_id'))
        @_state = 'closed'
        @syncdb.close()
        delete @syncdb
        if @_file_watcher?
            @_file_watcher.close()
            delete @_file_watcher

    _ajax: (opts) =>
        opts = defaults opts,
            url     : required
            timeout : 15000
            cb      : undefined    # (err, data)
        $.ajax(
            url     : opts.url
            timeout : opts.timeout
            success : (data) => opts.cb?(undefined, data)
        ).fail (err) => opts.cb?(err.statusText ? 'error')

    set_jupyter_kernels: =>
        if jupyter_kernels?
            @setState(kernels: jupyter_kernels)
        else
            f = (cb) =>
                if @_state == 'closed'
                    cb(); return
                @_ajax
                    url     : util.get_server_url(@store.get('project_id')) + '/kernels.json'
                    timeout : 3000
                    cb      : (err, data) =>
                        if err
                            cb(err)
                            return
                        try
                            jupyter_kernels = immutable.fromJS(JSON.parse(data))
                            @setState(kernels: jupyter_kernels)
                            cb()
                        catch e
                            @set_error("Error setting Jupyter kernels -- #{data} #{e}")

            misc.retry_until_success
                f           : f
                start_delay : 1500
                max_delay   : 15000

    set_error: (err) =>
        if not err?
            @setState(err: undefined)
            return
        cur = @store.get('error')
        if cur
            err = err + '\n\n' + cur
        @setState
            error : err

    set_cell_input: (id, input) =>
        @_set
            type  : 'cell'
            id    : id
            input : input
            start : null
            end   : null

    set_cell_output: (id, output) =>
        @_set
            type   : 'cell'
            id     : id
            output : output

    clear_selected_outputs: =>
        cells = @store.get('cells')
        for id in @store.get_selected_cell_ids_list()
            if cells.get(id).get('output')?
                @_set({type:'cell', id:id, output:null}, false)
        @_sync()

    clear_all_outputs: =>
        @store.get('cells').forEach (cell, id) =>
            if cell.get('output')?
                @_set({type:'cell', id:id, output:null}, false)
            return
        @_sync()

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

    set_md_cell_editing: (id) =>
        md_edit_ids = @store.get('md_edit_ids')
        if md_edit_ids.contains(id)
            return
        @setState(md_edit_ids : md_edit_ids.add(id))

    set_md_cell_not_editing: (id) =>
        md_edit_ids = @store.get('md_edit_ids')
        if not md_edit_ids.contains(id)
            return
        @setState(md_edit_ids : md_edit_ids.delete(id))

    # Set which cell is currently the cursor.
    set_cur_id: (id) =>
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

    unselect_all_cells: =>
        @setState(sel_ids : immutable.Set())

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

    set_mode: (mode) =>
        @setState(mode: mode)
        if mode == 'escape'
            @set_cursor_locs([])  # none

    set_cell_list: =>
        cells = @store.get('cells')
        if not cells?
            return
        cell_list = util.sorted_cell_list(cells)
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
            obj = {cells: cells.set(id, new_cell)}
            if not old_cell? or old_cell.get('pos') != new_cell.get('pos')
                cell_list_needs_recompute = true
            @setState(obj)
        if @_is_project
            @manage_on_cell_change(id, new_cell, old_cell)
        return cell_list_needs_recompute

    _syncdb_change: (changes) =>
        do_init = @_is_project and @_state == 'init'
        #console.log 'changes', changes, changes?.toJS()
        #@dbg("_syncdb_change")(JSON.stringify(changes?.toJS()))
        @set_has_unsaved_changes()
        cell_list_needs_recompute = false
        changes?.forEach (key) =>
            record = @syncdb.get_one(key)
            switch key.get('type')
                when 'cell'
                    if @_syncdb_cell_change(key.get('id'), record)
                        cell_list_needs_recompute = true
                when 'settings'
                    kernel = record?.get('kernel')
                    @setState
                        kernel        : kernel
                        identity      : record?.get('identity')
                        kernel_info   : @store.get_kernel_info(kernel)
                        backend_state : record?.get('backend_state')
                        kernel_state  : record?.get('kernel_state')
                        cm_options    : cm_options(kernel)
            return
        if cell_list_needs_recompute
            @set_cell_list()
        cur_id = @store.get('cur_id')
        if not cur_id? or not @store.getIn(['cells', cur_id])?
            @set_cur_id(@store.get('cell_list')?.get(0))

        if do_init
            @initialize_manager()
        else if @_state == 'init'
            @_state = 'ready'

    _syncdb_cursor_activity: =>
        cells = cells_before = @store.get('cells')
        next_cursors = @syncdb.get_cursors()
        next_cursors.forEach (info, account_id) =>
            if account_id == @_account_id  # don't process information about ourselves
                return
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
        @syncdb.exit_undo_mode()
        @syncdb.set(obj, save)
        # ensure that we update locally immediately for our own changes.
        @_syncdb_change(immutable.fromJS([misc.copy_with(obj, ['id', 'type'])]))

    _delete: (obj, save=true) =>
        if @_state == 'closed'
            return
        @syncdb.exit_undo_mode()
        @syncdb.delete(obj, save)
        @_syncdb_change(immutable.fromJS([{type:obj.type, id:obj.id}]))

    _sync: =>
        if @_state == 'closed'
            return
        @syncdb.sync()

    save: =>
        # Saves our customer format sync doc-db to disk; the backend will
        # (TODO) also save the normal ipynb file to disk right after.
        @syncdb.save () =>
            @set_has_unsaved_changes()
        @set_has_unsaved_changes()

    save_asap: =>
        @syncdb.save_asap (err) =>
            if err
                setTimeout((()=>@syncdb.save_asap()), 50)
        return

    _new_id: =>
        return misc.uuid().slice(0,8)  # TODO: choose something...; ensure is unique, etc.

    # TODO: for insert i'm using averaging; for move I'm just resetting all to integers.
    # **should** use averaging but if get close re-spread all properly.  OR use strings?
    insert_cell: (delta) =>  # delta = -1 (above) or +1 (below)
        cur_id = @store.get('cur_id')
        if not cur_id? # TODO
            return
        v = @store.get('cell_list')
        if not v?
            return
        adjacent_id = undefined
        v.forEach (id, i) ->
            if id == cur_id
                j = i + delta
                if j >= 0 and j < v.size
                    adjacent_id = v.get(j)
                return false  # break iteration
            return
        cells = @store.get('cells')
        if adjacent_id?
            adjacent_pos = cells.get(adjacent_id)?.get('pos')
        else
            adjacent_pos = undefined
        current_pos = cells.get(cur_id).get('pos')
        if adjacent_pos?
            pos = (adjacent_pos + current_pos)/2
        else
            pos = current_pos + delta
        new_id = @_new_id()
        @_set
            type  : 'cell'
            id    : new_id
            pos   : pos
            input : ''
        @set_cur_id(new_id)
        return new_id  # technically violates CQRS -- but not from the store.

    delete_selected_cells: (sync=true) =>
        selected = @store.get_selected_cell_ids_list()
        if selected.length == 0
            return
        id = @store.get('cur_id')
        @move_cursor_after(selected[selected.length-1])
        if @store.get('cur_id') == id
            @move_cursor_before(selected[0])
        for id in selected
            @_delete({type:'cell', id:id}, false)
        if sync
            @_sync()
        return

    # move all selected cells delta positions, e.g., delta = +1 or delta = -1
    move_selected_cells: (delta) =>
        if delta == 0
            return
        # This action changes the pos attributes of 0 or more cells.
        selected = @store.get_selected_cell_ids()
        if misc.len(selected) == 0
            return # nothing to do
        v = @store.get('cell_list')
        if not v?
            return  # don't even have cell list yet...
        v = v.toJS()  # javascript array of unique cell id's, properly ordered
        w = []
        # put selected cells in their proper new positions
        for i in [0...v.length]
            if selected[v[i]]
                n = i + delta
                if n < 0 or n >= v.length
                    # would move cells out of document, so nothing to do
                    return
                w[n] = v[i]
        # now put non-selected in remaining places
        k = 0
        for i in [0...v.length]
            if not selected[v[i]]
                while w[k]?
                    k += 1
                w[k] = v[i]
        # now w is a complete list of the id's in the proper order; use it to set pos
        t = new Date()
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

    run_cell: (id) =>
        cell = @store.getIn(['cells', id])
        if not cell?
            return

        @unselect_all_cells()  # for whatever reason, any running of a cell deselects in official jupyter

        @_input_editors?[id]?()
        cell_type = cell.get('cell_type') ? 'code'
        switch cell_type
            when 'code'
                code = cell.get('input').trim()
                if misc.endswith(code, '??')
                    @introspect(code.slice(0,code.length-2), 1)
                else if misc.endswith(code, '?')
                    @introspect(code.slice(0,code.length-1), 0)
                else
                    @run_code_cell(id)
            when 'markdown'
                @set_md_cell_not_editing(id)
        @save_asap()
        return

    run_code_cell: (id) =>
        @_set
            type         : 'cell'
            id           : id
            state        : 'start'
            start        : null
            end          : null
            output       : null
            exec_count   : null
            collapsed    : null

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
            @insert_cell(1)
            @set_mode('edit')
        else
            @move_cursor(1)
            @set_mode('escape')


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

    set_cursor_locs: (locs=[]) =>
        if locs.length == 0
            # don't remove on blur -- cursor will fade out just fine
            return
        @_cursor_locs = locs  # remember our own cursors for splitting cell
        @syncdb.set_cursor_locs(locs)

    split_current_cell: =>
        cursor = @_cursor_locs?[0]
        if not cursor?
            return
        if cursor.id != @store.get('cur_id')
            # cursor isn't in currently selected cell, so don't know how to split
            return
        # insert a new cell after the currently selected one
        new_id = @insert_cell(1)
        # split the cell content at the cursor loc
        cell = @store.get('cells').get(cursor.id)
        if not cell?
            return  # this would be a bug?
        cell_type = cell.get('cell_type')
        if cell_type != 'code'
            @set_cell_type(new_id, cell_type)
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
        @set_cell_input(cursor.id, top)
        @set_cell_input(new_id, bottom)

    # Copy content from the cell below the current cell into the currently
    # selected cell, then delete the cell below the current cell.s
    merge_cell_below: =>
        cur_id = @store.get('cur_id')
        if not cur_id?
            return
        next_id = @store.get_cell_id(1)
        if not next_id?
            return
        cells = @store.get('cells')
        if not cells?
            return
        input  = (cells.get(cur_id)?.get('input') ? '') + '\n' + (cells.get(next_id)?.get('input') ? '')
        @_delete({type:'cell', id:next_id}, false)
        @set_cell_input(cur_id, input)
        return

    merge_cell_above: =>
        @move_cursor(-1)
        @merge_cell_below()
        return

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

    # Javascript array of num equally spaced positions starting after before_pos and ending
    # before after_pos, so
    #   [before_pos+delta, before_pos+2*delta, ..., after_pos-delta]
    _positions_between: (before_pos, after_pos, num) =>
        if not before_pos?
            if not after_pos?
                pos = 0
                delta = 1
            else
                pos = after_pos - num
                delta = 1
        else
            if not after_pos?
                pos = before_pos + 1
                delta = 1
            else
                delta = (after_pos - before_pos) / (num + 1)
                pos = before_pos + delta
        v = []
        for i in [0...num]
            v.push(pos)
            pos += delta
        return v

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
        if delta == 0
            # replace, so delete currently selected
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
        positions = @_positions_between(before_pos, after_pos, clipboard.size)
        clipboard.forEach (cell, i) =>
            cell = cell.set('id', @_new_id())   # randomize the id of the cell
            cell = cell.set('pos', positions[i])
            @_set(cell, false)
            return
        @_sync()

    toggle_toolbar: =>
        @setState(toolbar: not @store.get('toolbar'))

    toggle_header: =>
        @redux?.getActions('page').toggle_fullscreen()

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

    register_input_editor: (id, save_value) =>
        @_input_editors ?= {}
        @_input_editors[id] = save_value

    unregister_input_editor: (id) =>
        delete @_input_editors?[id]

    set_kernel: (kernel) =>
        if @store.get('kernel') != kernel
            @_set
                type   : 'settings'
                kernel : kernel

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

        identity = @store.get('identity')
        if not identity?
            # TODO: need to initialize kernel... or something
            return
        @setState(complete: undefined)

        # pos can be either a {line:?, ch:?} object as in codemirror,
        # or a number.
        if misc.is_object(pos)
            lines = code.split('\n')
            cursor_pos = misc.sum(lines[i].length+1 for i in [0...pos.line]) + pos.ch
        else
            cursor_pos = pos

        @_ajax
            url     : util.get_complete_url(@store.get('project_id'), identity, code, cursor_pos)
            timeout : 5000
            cb      : (err, data) =>
                if @_complete_request > req
                    # future completion or clear happened; so ignore this result.
                    return
                if err
                    complete = {error  : err}
                else
                    complete = JSON.parse(data)
                    if complete.status != 'ok'
                        complete = {error:'completion failed'}
                    delete complete.status

                # Set the result so the UI can then react to the change.
                if complete?.matches?.length == 0
                    # do nothing -- no completions at all
                    return
                if offset?
                    complete.offset = offset
                @setState(complete: immutable.fromJS(complete))
                if complete?.matches?.length == 1 and id?
                    # special case -- a unique completion and we know id of cell in which completing is given
                    @select_complete(id, complete.matches[0])
                    return
        return

    clear_complete: =>
        @_complete_request = (@_complete_request ? 0) + 1
        @setState(complete: undefined)

    select_complete: (id, item) =>
        complete = @store.get('complete')
        input    = @store.getIn(['cells', id, 'input'])
        @clear_complete()
        @set_mode('edit')
        if complete? and input? and not complete.get('error')?
            new_input = input.slice(0, complete.get('cursor_start')) + item + input.slice(complete.get('cursor_end'))
            # We don't actually make the completion until the next render loop,
            # so that the editor is already in edit mode.  This way the cursor is
            # in the right position after making the change.
            setTimeout((=> @set_cell_input(id, new_input)), 0)

    introspect: (code, level, cursor_pos) =>
        req = @_introspect_request = (@_introspect_request ? 0) + 1

        identity = @store.get('identity')
        if not identity?
            # TODO: need to initialize kernel... or something
            return
        @setState(introspect: undefined)

        cursor_pos ?= code.length

        @_ajax
            url     : util.get_introspect_url(@store.get('project_id'), identity, code, cursor_pos, level)
            timeout : 15000
            cb      : (err, data) =>
                if @_introspect_request > req
                    # future completion or clear happened; so ignore this result.
                    return
                if err
                    introspect = {error  : err}
                else
                    introspect = JSON.parse(data)
                    if introspect.status != 'ok'
                        introspect = {error:'completion failed'}
                    delete introspect.status

                @setState(introspect: immutable.fromJS(introspect))
        return

    clear_introspect: =>
        @_introspect_request = (@_introspect_request ? 0) + 1
        @setState(introspect: undefined)

    signal: (signal='SIGINT') =>
        identity = @store.get('identity')
        if not identity?
            return
        @_ajax
            url     : util.get_signal_url(@store.get('project_id'), identity, signal)
            timeout : 5000




