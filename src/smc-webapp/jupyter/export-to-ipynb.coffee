###

Exporting from our in-memory sync-friendly format to ipynb

###

misc = require('smc-util/misc')
{required, defaults} = misc

exports.export_to_ipynb = (opts) ->
    opts = defaults opts,
        cell_list   : required
        cells       : required
        kernelspec  : {}    # official jupyter will give an error on load without properly giving this (and ask to select a kernel)
        blob_store  : undefined
        more_output : undefined

    ipynb =
        cells          : (cell_to_ipynb(opts.cells.get(id), opts.blob_store, opts.more_output) for id in opts.cell_list.toJS())
        metadata       :
            kernelspec: opts.kernelspec
        nbformat       : 4
        nbformat_minor : 0
    return ipynb

# Return ipynb version of the given cell as Python object
cell_to_ipynb = (cell, blob_store, more_output) =>
    id = cell.get('id')
    output = cell.get('output')

    # If the last message has the more_output field, then there may be
    # more output messages stored, which are not in the cells object.
    if output?.get("#{output.size-1}")?.get('more_output')?
        if not more_output?[id]?
            # For some reason more output is not available for this cell.  So we replace
            # the more_output message by an error explaining what happened.

        else
            # Indeed, the last message has the more_output field.
            # Before converting to ipynb, we remove that last message...
            n = output.size - 1
            output = output.delete("#{n}")
            # Then we put in the known more output.
            for mesg in more_output[id]
                output = output.set("#{n}", immutable.fromJS(mesg))
                n += 1
            # Now, everything continues as normal.

    obj =
        cell_type : cell.get('cell_type') ? 'code'
        source    : cell.get('input')
        metadata  : {}
    if cell.get('collapsed')
        obj.metadata.collapsed = true
    if cell.get('scrolled')
        obj.metadata.scrolled = true

    if output?.size > 0
        v = (cell_to_ipynb_nth_output(cell, n, blob_store) for n in [0...output.size])
        obj.outputs = (x for x in v when x?)
    if not obj.outputs? and obj.cell_type == 'code'
        obj.outputs = [] # annoying requirement of ipynb file format.
    if obj.cell_type == 'code'
        obj.execution_count = cell.get('exec_count') ? 0
    return obj

cell_to_ipynb_nth_output = (cell, n, blob_store) =>
    nth_output = cell.getIn(['output', "#{n}"])?.toJS()
    if not nth_output?
        return
    if nth_output.data?
        for k, v of nth_output.data
            if misc.startswith(k, 'image/')
                if blob_store?
                    value = blob_store.get_ipynb(v)
                    if not value?
                        # The image is no longer known; this could happen if the user reverts in the history
                        # browser and there is an image in the output that was not saved in the latest version.
                        # TODO: instead return an error.
                        return
                    nth_output.data[k] = value
                else
                    return  # impossible to include in the output without blob_store
        nth_output.output_type = "execute_result"
        nth_output.metadata = {}
        nth_output.execution_count = cell.get('exec_count')
    else if nth_output.name?
        nth_output.output_type = 'stream'
    else if nth_output.ename?
        nth_output.output_type = 'error'
    return nth_output
