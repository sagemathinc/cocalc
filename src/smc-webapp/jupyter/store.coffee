misc       = require('smc-util/misc')

{Store}  = require('../smc-react')

# Used for copy/paste.  We make a single global clipboard, so that
# copy/paste between different notebooks works.
global_clipboard = undefined

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

    get_scroll_state: =>
        return @get_local_storage('scroll')

    set_global_clipboard: (clipboard) =>
        global_clipboard = clipboard

    get_global_clipboard: =>
        return global_clipboard

    has_uncommitted_changes: =>
        return @syncdb.has_uncommitted_changes()

    get_local_storage: (key) =>
        value = localStorage?[@name]
        if value?
            return misc.from_json(value)?[key]

    get_kernel_info: (kernel) =>
        # slow/inefficient, but ok since this is rarely called
        info = undefined
        @get('kernels')?.forEach (x) =>
            if x.get('name') == kernel
                info = x.toJS()
                return false
        return info

    ###
    Export the Jupyer notebook to an ipynb object.

    NOTE: this is of course completely different than saving the syncdb
    synchronized document to disk.
    ###
    get_ipynb: (blob_store) =>
        if not @get('kernels')?
            # kernels must be known before we can save, since the stupid ipynb file format
            # requires several pointless extra pieces of information about the kernel...
            return
        ipynb =
            cells : (@get_ipynb_cell(id, blob_store) for id in @get('cell_list').toJS())
            metadata :
                kernelspec: @get_kernel_info(@get('kernel'))
            nbformat : 4
            nbformat_minor : 0
        return ipynb

    # Return ipynb version of the given cell as Python object
    get_ipynb_cell: (id, blob_store) =>
        cell = @getIn(['cells', id])
        output = cell.get('output')
        obj =
            cell_type       : cell.get('cell_type') ? 'code'
            source          : cell.get('input')
            metadata        : {}
        if cell.get('collapsed')
            obj.metadata.collapsed = true
        if cell.get('scrolled')
            obj.metadata.scrolled = true

        if output?.size > 0
            v = (@get_ipynb_cell_output(id, n, blob_store) for n in [0...output.size])
            obj.outputs = (x for x in v when x?)
        if not obj.outputs? and obj.cell_type == 'code'
            obj.outputs = [] # annoying requirement of ipynb file format.
        if obj.cell_type == 'code'
            obj.execution_count = cell.get('exec_count') ? 0
        return obj

    get_ipynb_cell_output: (id, n, blob_store) =>
        output = @getIn(['cells', id, 'output', "#{n}"]).toJS()
        if output.data?
            for k, v of output.data
                if misc.startswith(k, 'image/')
                    if blob_store?
                        value = blob_store.get_ipynb(v)
                        if not value?
                            # The image is no longer known; this could happen if the user reverts in the history
                            # browser and there is an image in the output that was not saved in the latest version.
                            return
                        output.data[k] = value
                    else
                        return  # impossible to include in the output without blob_store
            output.output_type = "execute_result"
            output.metadata = {}
            output.execution_count = @getIn(['cells', id, 'exec_count'])
        else if output.name?
            output.output_type = 'stream'
        else if output.ename?
            output.output_type = 'error'
        return output



