{Store}  = require('../smc-react')

class exports.JupyterStore extends Store
    # Return map from selected cell ids to true, in no particular order
    get_selected_cell_ids: =>
        selected = {}
        cur_id = @get('cur_id')
        if cur_id?
            selected[cur_id] = true
        @get('sel_ids').map (x) ->
            selected[x] = true
            return
        return selected

    # Return sorted javascript array of the selected cell ids
    get_selected_cell_ids_list: =>
        # iterate over *ordered* list so we run the selected cells in order
        # TODO: Could do in O(1) instead of O(n) by sorting only selected first by position...; maybe use algorithm based on size...
        selected = @get_selected_cell_ids()
        v = []
        @get('cell_list').forEach (id) =>
            if selected[id]
                v.push(id)
            return
        return v

    get_cell_index: (id) =>
        cell_list = @get('cell_list')
        if not cell_list? # ordered list of cell id's not known
            return
        if not id?
            return
        i = cell_list.indexOf(id)
        if i == -1
            return
        return i

    get_cur_cell_index: =>
        return @get_cell_index(@get('cur_id'))

    # Get the id of the cell that is delta positions from the
    # cursor or from cell with given id (second input).
    # Returns undefined if no currently selected cell, or if delta
    # positions moves out of the notebook (so there is no such cell).
    get_cell_id: (delta=0, id=undefined) =>
        if id?
            i = @get_cell_index(id)
        else
            i = @get_cur_cell_index()
        if not i?
            return
        i += delta
        cell_list = @get('cell_list')
        if i < 0 or i >= cell_list.size
            return   # .get negative for List in immutable wraps around rather than undefined (like Python)
        return @get('cell_list')?.get(i)

    get_font_size: =>
        return @get('font_size') ? @redux.getStore('account')?.get('font_size') ? 14

    get_cursors: =>
        return @syncdb.get_cursors()