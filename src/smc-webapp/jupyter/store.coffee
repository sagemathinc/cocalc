###
The Store
###

immutable         = require('immutable')
misc              = require('smc-util/misc')
{Store}           = require('../smc-react')
{cm_options}      = require('./cm_options')
{export_to_ipynb} = require('./export-to-ipynb')

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

    ###
    get_ipynb: (blob_store) =>
        #if @_is_project
        #    more_output = @_more_output
        #else
        #    more_output = @get('more_output')

        return export_to_ipynb
            cells       : @get('cells')
            cell_list   : @get('cell_list')
            kernelspec  : @get_kernel_info(@get('kernel'))
            blob_store  : blob_store
            #more_output : more_output

    get_cm_options: (kernel) =>
        # TODO: this is temporary until implementing "editor options" from account settings...
        options = cm_options(kernel)
        if @get_local_storage('line_numbers')?
            options = options.set('lineNumbers', @get_local_storage('line_numbers'))
        return options

    # used by the backend for storing extra output
    get_more_output: (id) =>
        @_more_output ?= {}
        output = @_more_output[id]
        if not output?
            return
        messages = output.messages

        for x in ['discarded', 'truncated']
            if output[x]
                if x == 'truncated'
                    text = "WARNING: some output was truncated.\n"
                else
                    text = "WARNING: #{output[x]} output #{if output[x]>1 then 'messages were' else 'message was'} #{x}.\n"
                warn = [{"text":text, "name":"stderr"}]
                if messages.length > 0
                    messages = warn.concat(messages).concat(warn)
                else
                    messages = warn
        return messages

