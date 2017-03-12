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

{Actions}  = require('../smc-react')


###
The actions -- what you can do with a jupyter notebook, and also the
underlying synchronized state.
###

class exports.JupyterActions extends Actions

    _init: =>
        cm_options =
            indentUnit        : 4
            matchBrackets     : true
            autoCloseBrackets : true
            mode              :
                name                   : "python"
                version                : 3
                singleLineStringErrors : false

        @setState
            error      : undefined
            cur_id     : undefined
            toolbar    : true
            sel_ids    : immutable.Set()  # immutable set of selected cells
            md_edit_ids: immutable.Set()  # set of ids of markdown cells in edit mode
            mode       : 'escape'
            cm_options : immutable.fromJS(cm_options)

    close: =>
        if @_closed
            return
        @syncdb.close()
        @_closed = true
        delete @syncdb

    set_error: (err) =>
        @setState
            error : err

    set_cell_input: (id, input) =>
        @_set
            type  : 'cell'
            id    : id
            input : input

    set_cell_pos: (id, pos, save=true) =>
        @_set({type: 'cell', id: id, pos: pos}, save)

    set_cell_type : (id, cell_type) =>
        obj =
            type      : 'cell'
            id        : id
            cell_type : cell_type
        if cell_type != 'code'
            # delete output when switching to non-code cell_type
            obj.output = null
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

    set_cur_id: (id) =>
        @setState(cur_id : id)
        return

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
        if not cur_id?  # must be selected
            return
        if cur_id == id # nothing to do
            return
        i = 0
        v = @store.get('cell_list').toJS()
        for i, x of v
            if x == id
                endpoint0 = i
            if x == cur_id
                endpoint1 = i
        if endpoint0 > endpoint1
            [endpoint0, endpoint1] = [endpoint1, endpoint0]
        for i in [endpoint0..endpoint1]
            @select_cell(v[i])
        @set_cur_id(id)

    set_mode: (mode) =>
        @setState(mode: mode)

    set_cell_list: =>
        cells = @store.get('cells')
        if not cells?
            return
        # TODO (j3?): rewrite staying immutable
        v = []
        cells.forEach (record, id) ->
            v.push({id:id, pos:record.get('pos')})
            return
        v.sort (a,b) ->
            misc.cmp(a.pos, b.pos)
        v = (x.id for x in v)
        cell_list = immutable.List(v)
        if not cell_list.equals(@store.get('cell_list'))
            @setState(cell_list : cell_list)
        return

    _syncdb_cell_change: (id, record) =>
        cells = @store.get('cells') ? immutable.Map()
        cell_list_needs_recompute = false
        if not record?
            # delete cell
            if cells?.get(id)?
                obj = {cells: cells.delete(id)}
                cell_list = @store.get('cell_list')
                if cell_list?
                    obj.cell_list = cell_list.filter((x) -> x != id)
                @setState(obj)
        else
            # change or add cell
            current = cells.get(id)
            if record.equals(current)
                return # nothing to do
            obj = {cells: cells.set(id, record)}
            if not current? or current.get('pos') != record.get('pos')
                cell_list_needs_recompute = true
            @setState(obj)
        return cell_list_needs_recompute

    _syncdb_change: (changes) =>
        #console.log 'changes', changes, changes?.toJS()
        cell_list_needs_recompute = false
        changes?.forEach (key) =>
            record = @syncdb.get_one(key)
            switch key.get('type')
                when 'cell'
                    if @_syncdb_cell_change(key.get('id'), record)
                        cell_list_needs_recompute = true
                when 'settings'
                    @setState
                        kernel : record?.get('kernel')
            return
        if cell_list_needs_recompute
            @set_cell_list()
        else
            @ensure_there_is_a_cell()
        cur_id = @store.get('cur_id')
        if not cur_id? # todo: or the cell doesn't exist
            @set_cur_id(@store.get('cell_list')?[0])

    ensure_there_is_a_cell: =>
        cells = @store.get('cells')
        if not cells? or cells.size == 0
            @_set
                type  : 'cell'
                id    : @_new_id()
                pos   : 0
                value : ''

    _set: (obj, save=true) =>
        if @_closed
            return
        @syncdb.exit_undo_mode()
        @syncdb.set(obj, save)
        # ensure that we update locally immediately for our own changes.
        @_syncdb_change(immutable.fromJS([{type:obj.type, id:obj.id}]))

    _delete: (obj, save=true) =>
        if @_closed
            return
        @syncdb.exit_undo_mode()
        @syncdb.delete(obj, save)
        @_syncdb_change(immutable.fromJS([{type:obj.type, id:obj.id}]))

    _sync: =>
        if @_closed
            return
        @syncdb.sync()

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
            value : ''
        return new_id  # technically violates CQRS -- but not from the store.

    delete_selected_cells: (sync=true) =>
        for id,_ of @store.get_selected_cell_ids()
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
        cell_type = cell.get('cell_type') ? 'code'
        switch cell_type
            when 'code'
                @run_code_cell(id)
            when 'markdown'
                @set_md_cell_not_editing(id)
        return

    run_code_cell: (id) =>
        # TODO: implement :-)

    run_selected_cells: =>
        v = @store.get_selected_cell_ids_list()
        for id in v
            @run_cell(id)
        if v.length > 0
            @move_cursor_after(v[v.length-1])

    run_all_cells: =>
        @store.get('cell_list').forEach (id) =>
            @run_cell(id)
            return

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

    set_cursor_locs: (locs) =>
        @_cursor_locs = locs
        # TODO: also right to cursors table

    split_current_cell: =>
        cursor = @_cursor_locs?[0]
        if not cursor?
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

    merge_cell_above: =>
        @move_cursor(-1)
        @merge_cell_below()

    # Copy all currently selected cells into our internal clipboard
    copy_selected_cells: =>
        cells = @store.get('cells')
        clipboard = immutable.List()
        for id in @store.get_selected_cell_ids_list()
            clipboard = clipboard.push(cells.get(id))
        @setState(clipboard: clipboard)

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
        clipboard = @store.get('clipboard')
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
        # TODO