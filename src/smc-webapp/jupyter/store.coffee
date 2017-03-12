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

    # Get the id of the cell that is delta positions from the cursor.
    # Returns undefined if no currently selected cell, or if delta
    # positions moves out of the notebook (so there is no such cell).
    get_cell_id: (delta=0) =>
        i = @get_cur_cell_index()
        if not i?
            return
        return @get('cell_list')?.get(i + delta)


