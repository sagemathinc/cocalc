###
Misc utility functions for manipulating and working wth cells.
###

immutable = require('immutable')

misc = require('smc-util/misc')

exports.positions_between = (before_pos, after_pos, num) ->
    # Return an array of num equally spaced positions starting after
    # before_pos and ending before after_pos, so
    #   [before_pos+delta, before_pos+2*delta, ..., after_pos-delta]
    # where delta is a function of the endpoints and num.
    if before_pos > after_pos
        [before_pos, after_pos] = [after_pos, before_pos]
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

exports.sorted_cell_list = (cells) ->
    # Given an immutable Map from id's to cells, returns an immutable List whose
    # entries are the id's in the correct order, as defined by the pos field (a float).
    if not cells?
        return
    # TODO: rewrite staying immutable
    v = []
    cells.forEach (record, id) ->
        v.push({id:id, pos:record.get('pos') ? -1})   # set undefined to -1 to get total ordering; ensure below will fix this in a few seconds, but in the meantime, better to have some sanity.
        return
    v.sort(misc.field_cmp('pos'))
    v = (x.id for x in v)
    return immutable.List(v)

exports.ensure_positions_are_unique = (cells) ->
    # Verify that pos's of cells are distinct.  If not
    # return map from id's to new unique positions.
    if not cells?
        return
    v = {}
    all_unique = true
    cells.forEach (cell, id) ->
        pos = cell.get('pos')
        if not pos? or v[pos]
            # dup! (or not defined)
            all_unique = false
            return false
        v[pos] = true
        return
    if all_unique
        return
    pos = 0
    new_pos = {}
    exports.sorted_cell_list(cells).forEach (id) =>
        new_pos[id] = pos
        pos += 1
        return
    return new_pos

exports.new_cell_pos = (cells, cell_list, cur_id, delta) ->
    ###
    Returns pos for a new cell whose position
    is relative to the cell with cur_id.

     cells     = immutable map id --> pos
     cell_list = immutable sorted list of id's (derived from cells)
     cur_id    = one of the ids
     delta     = -1 (above) or +1 (below)

    Returned undefined whenever don't really know what to do; then caller
    just makes up a pos, and it'll get sorted out.
    ###
    if not cells? or not cur_id? or not delta?
        return
    cell_list ?= exports.sorted_cell_list(cells)
    adjacent_id = undefined
    cell_list.forEach (id, i) ->
        if id == cur_id
            j = i + delta
            if j >= 0 and j < cell_list.size
                adjacent_id = cell_list.get(j)
            return false  # break iteration
        return
    adjacent_pos = cells.get(adjacent_id)?.get('pos')
    current_pos  = cells.get(cur_id).get('pos')
    if adjacent_pos?
        # there is a cell after (or before) cur_id cell
        pos = (adjacent_pos + current_pos)/2
    else
        # no cell after (or before)
        pos = current_pos + delta
    return pos


exports.move_selected_cells = (v, selected, delta) ->
    ###
    - v = ordered js array of all cell id's
    - selected = js map from ids to true
    - delta = integer

    Returns new ordered js array of all cell id's or undefined if nothing to do.
    ###
    if not v? or not selected? or not delta or misc.len(selected) == 0
        return # nothing to do
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

    return w



