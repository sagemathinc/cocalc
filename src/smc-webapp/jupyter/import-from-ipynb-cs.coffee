###
Importing from an ipynb object (in-memory version of .ipynb file)
###

misc = require('smc-util/misc')
{defaults, required} = misc

util = require('./util')

{JUPYTER_MIMETYPES} = util

DEFAULT_IPYNB = {"cells":[{"cell_type":"code","execution_count":null,"metadata":{},"outputs":[],"source":[]}],"metadata":{"kernelspec":{"display_name":"Python 2","language":"python","name":"python2"},"language_info":{"codemirror_mode":{"name":"ipython","version":2},"file_extension":".py","mimetype":"text/x-python","name":"python","nbconvert_exporter":"python","pygments_lexer":"ipython2","version":"2.7.13"}},"nbformat":4,"nbformat_minor":0}

class exports.IPynbImporter
    import: (opts) =>
        opts = defaults opts,
            ipynb              : {}
            new_id             : undefined  # function that returns an unused id given
                                      # an is_available function; new_id(is_available) = a new id.
            existing_ids       : []         # re-use these on loading for efficiency purposes
            output_handler     : undefined  # h = output_handler(cell); h.message(...) -- hard to explain
            process_attachment : undefined  # process attachments:  attachment(base64, mime) --> sha1

        @_ipynb              = misc.deep_copy(opts.ipynb)
        @_new_id             = opts.new_id
        @_output_handler     = opts.output_handler
        @_process_attachment = opts.process_attachment
        @_existing_ids       = opts.existing_ids  # option to re-use existing ids

        @_handle_old_versions()  # must come before sanity checks, as old versions are "insane". -- see https://github.com/sagemathinc/cocalc/issues/1937
        @_sanity_improvements()
        @_import_settings()
        @_import_metadata()
        @_read_in_cells()
        return

    cells: =>
        return @_cells

    kernel: =>
        return @_kernel

    metadata: =>
        return @_metadata

    close: =>
        delete @_cells
        delete @_kernel
        delete @_metadata
        delete @_language_info
        delete @_ipynb
        delete @_existing_ids
        delete @_new_id
        delete @_output_handler
        delete @_process_attachment

    ###
    Everything below is the internal private implementation.
    ###

    _sanity_improvements: =>
        # Do some basic easy sanity improvements to ipynb boject,
        # in case parts of the object are missing.
        ipynb = @_ipynb
        if not ipynb.cells? or ipynb.cells.length == 0
            ipynb.cells = misc.deep_copy(DEFAULT_IPYNB.cells)
        if not ipynb.metadata?
            ipynb.metadata = misc.deep_copy(DEFAULT_IPYNB.metadata)
        ipynb.nbformat ?= DEFAULT_IPYNB.nbformat
        ipynb.nbformat_minor ?= DEFAULT_IPYNB.nbformat_minor

    _handle_old_versions: () =>
        # Update the ipynb file from formats before version 4.
        # There are other changes made when parsing cells.
        ipynb = @_ipynb
        if ipynb.nbformat >= 4
            return
        ipynb.cells ?= []
        for worksheet in ipynb.worksheets ? []
            for cell in worksheet.cells ? []
                if cell.input?
                    cell.source = cell.input
                    delete cell.input
                if cell.cell_type == 'heading'
                    cell.cell_type = 'markdown'
                    if misc.is_array(cell.source)
                        cell.source = cell.source.join('')
                    cell.source = '# ' + "#{cell.source}"

                if cell.outputs
                    for mesg in cell.outputs
                        if mesg.output_type == 'pyout'
                            for type in JUPYTER_MIMETYPES
                                [a,b] = type.split('/')
                                if mesg[b]?
                                    data = {"#{type}": mesg[b]}
                                    for k, v of mesg
                                        delete mesg[k]
                                    mesg.data = data
                                    break
                            if mesg.text?
                                data = {"text/plain": mesg.text.join('')}
                                for k, v of mesg
                                    delete mesg[k]
                                mesg.data = data

                ipynb.cells.push(cell)

    _import_settings: =>
        @_kernel = @_ipynb?.metadata?.kernelspec?.name

    _import_metadata: =>
        m = @_ipynb?.metadata
        if not m?
            return
        metadata = {}
        for k, v of m
            if k == 'kernelspec'
                continue
            metadata[k] = v
        if misc.len(metadata) > 0
            @_metadata = metadata

    _read_in_cells: =>
        ipynb = @_ipynb
        cells = @_cells = {}
        if not ipynb?.cells?
            # nothing to do
            return
        n = 0
        for cell in ipynb.cells
            cell = @_import_cell(cell, n)
            @_cells[cell.id] = cell
            n += 1

    _update_output_format: (content) =>
        if @_ipynb?.nbformat >= 4
            return content
        # fix old deprecated fields
        if content.output_type == 'stream'
            if misc.is_array(content.text)
                content.text = content.text.join('')
            content.name = content.stream
        else
            for t in JUPYTER_MIMETYPES
                [a,b] = t.split('/')
                if content[b]?
                    content = {data:{"#{t}": content[b]}}
                    break  # at most one data per message.
            if content.text?
                content = {data:{'text/plain':content.text}, output_type:'stream'}
        return content

    _join_array_strings_obj: (obj) =>
        if obj?
            for key, val of obj
                if misc.is_array(val)
                    obj[key] = val.join('')
        return obj

    # Mutate content to be of the format we use internally
    _import_cell_output_content: (content) =>
        content = @_update_output_format(content)  # old versions
        @_join_array_strings_obj(content.data)     # arrays --> strings
        if misc.is_array(content.text)
            content.text = content.text.join('')
        remove_redundant_reps(content.data)        # multiple output formats
        delete content.prompt_number               # redundant; in some files
        return content

    _id_is_available: (id) =>
        return not (@_cells?[id] or id in (@_existing_ids ? []))

    _get_new_id: =>
        if @_new_id?
            return @_new_id(@_id_is_available)
        else
            id = 0
            while true
                s = "#{id}"
                if @_id_is_available(s)
                    return s
                id += 1

    _get_exec_count: (execution_count, prompt_number) =>
        if execution_count?
            return execution_count
        else if prompt_number?
            return prompt_number
        else
            return null

    _get_cell_type: (cell_type) =>
        return cell_type ? 'code'

    _get_cell_output: (outputs, alt_outputs, id) =>
        if outputs?.length > 0
            cell = {id:id, output:{}}
            if @_output_handler?
                handler = @_output_handler(cell)

            for k, content of outputs  # it's fine/good that k is a string here.
                cocalc_alt = alt_outputs?[k]
                if cocalc_alt?
                    content = cocalc_alt
                @_import_cell_output_content(content)
                if handler?
                    handler.message(content)
                else
                    cell.output[k] = content
            handler?.done?()
            return cell.output
        else
            return null

    _get_cell_input: (source) =>
        if source?
            # "If you intend to work with notebook files directly, you must allow multi-line
            # string fields to be either a string or list of strings."
            # https://nbformat.readthedocs.io/en/latest/format_description.html#top-level-structure
            if misc.is_array(source)
                input = source.join('')
            else
                input = source
        else
            input = null

    _import_cell: (cell, n) =>
        id = @_existing_ids?[n] ? @_get_new_id()
        obj =
            type       : 'cell'
            id         : id
            pos        : n
            input      : @_get_cell_input(cell.source, n)
            output     : @_get_cell_output(cell.outputs, cell.metadata?.cocalc?.outputs, id)
            cell_type  : @_get_cell_type(cell.cell_type)
            exec_count : @_get_exec_count(cell.execution_count, cell.prompt_number)

        if cell.metadata?
            for k in ['collapsed', 'scrolled']
                if cell.metadata?[k]
                    obj[k] = !!cell.metadata?[k]

            if cell.metadata?.slideshow?
                obj.slide = cell.metadata.slideshow.slide_type

            if cell.metadata?.tags?
                obj.tags = misc.dict([tag, true] for tag in cell.metadata.tags)

            other = misc.copy_without(cell.metadata, ['collapsed', 'scrolled', 'slideshow', 'tags'])
            if misc.len(other) > 0
                obj.metadata = other

        if cell.attachments?
            obj.attachments = {}
            for name, val of cell.attachments
                for mime, base64 of val
                    if @_process_attachment?
                        sha1 = @_process_attachment(base64, mime)
                        obj.attachments[name] = {type:'sha1', value:sha1}
                    else
                        obj.attachments[name] = {type:'base64', value:base64}
        return obj


exports.remove_redundant_reps = remove_redundant_reps = (data) ->
    if not data?
        return
    # We only keep the first representation in types, since it provides the richest
    # representation in the client; there is no need for the others.
    # TODO: probably we should still store all of these types somewhere (in the
    # backend only) for the .ipynb export, but I'm not doing that right now!
    # This means opening and closing an ipynb file may lose information, which
    # no client currently cares about (?) -- maybe nbconvert does.
    for type in JUPYTER_MIMETYPES
        if data[type]?
            keep = type
            break
    if keep?
        for type,_ of data
            if type != keep
                delete data[type]
    return data
