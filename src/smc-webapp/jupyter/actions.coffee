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

    _init: () =>
        @setState
            error   : undefined
            cur_id  : undefined
            sel_ids : immutable.Set()  # immutable set of selected cells
            mode    : 'escape'

    set_error: (err) =>
        @setState
            error : err

    set_cell_input: (id, value) =>
        @syncdb.set
            type  : 'cell'
            id    : id
            input : value

    set_cell_pos: (id, pos) =>
        @syncdb.set
            type  : 'cell'
            id    : id
            pos   : pos

    set_cur_id: (id) =>
        @setState(cur_id : id)

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
        cells.map (record, id) ->
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
        if not record?
            # delete cell
            if cells?.get(id)?
                @setState
                    cells     : cells.delete(id)
                    cell_list : undefined
        else
            # change or add cell
            if not record.equals(cells.get(id))
                @setState
                    cells     : cells.set(id, record)
                    cell_list : undefined
        return

    _syncdb_change: (changes) =>
        #console.log 'changes', changes, changes?.toJS()
        if not changes?  # nothing to do
            return
        changes.map (key) =>
            record = @syncdb.get_one(key)
            switch key.get('type')
                when 'cell'
                    @_syncdb_cell_change(key.get('id'), record)
                when 'settings'
                    @setState
                        kernel : record?.get('kernel')
            return
        if not @store.get('cell_list')?
            @set_cell_list()
        # cells.sort...
        cur_id = @store.get('cur_id')
        if not cur_id? # todo: or the cell doesn't exist
            @set_cur_id(@store.get('cell_list')?[0])

    _set: (obj) =>
        @syncdb.set(obj)
        @syncdb.save()  # save to file on disk

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
                @set_cell_pos(id, pos)
