"""
Redux actions for nbviewer.

"""

{Actions}       = require('../smc-react')
{cm_options}    = require('./cm_options')
immutable       = require('immutable')
cell_utils      = require('./cell-utils')
util            = require('./util')
{IPynbImporter} = require('./import-from-ipynb')

class exports.NBViewerActions extends Actions
    _init: (project_id, path, store, client, content) =>
        @store  = store
        if not client? and not content?
            throw Error("@client or content must be defined")
        @client = client
        @setState
            project_id : project_id
            path       : path
            font_size  : @redux.getStore('account')?.get('font_size') ? 14
        @_state = 'ready'
        if content?  # optionally specify the pre-loaded content of the path directly.
            try
                ipynb = JSON.parse(content)
            catch err
                @setState(error: "Error parsing -- #{err}")
                return
            @set_from_ipynb(ipynb)
        else
            @load_ipynb()

    load_ipynb: =>
        if @store.get('loading')
            return
        @setState(loading:new Date())
        @client.public_get_text_file
            project_id : @store.get('project_id')
            path       : @store.get('path')
            cb         : (err, data) =>
                if @_state == 'closed'
                    return
                @setState(loading:undefined)
                if err
                    @setState(error: "Error loading -- #{err}")
                else
                    try
                        ipynb = JSON.parse(data)
                    catch err
                        @setState(error: "Error parsing -- #{err}")
                        return
                    @set_from_ipynb(ipynb)

    _process: (content) =>
        if not content.data?
            return
        for type in util.JUPYTER_MIMETYPES
            if content.data[type]?
                if type.split('/')[0] == 'image' or type == 'application/pdf'
                    content.data[type] = {value:content.data[type]}

    set_from_ipynb: (ipynb) =>
        importer = new IPynbImporter()
        importer.import
            ipynb          : ipynb
            output_handler : (cell) =>
                k = 0
                message : (content) =>
                    @_process(content)
                    cell.output["#{k}"] = content
                    k += 1

        cells      = immutable.fromJS(importer.cells())
        cell_list  = cell_utils.sorted_cell_list(cells)
        if ipynb.metadata?.language_info?.codemirror_mode?
            mode = ipynb.metadata?.language_info?.codemirror_mode
        else if ipynb.metadata?.language_info?.name?
            mode = ipynb.metadata?.language_info?.name
        else
            mode = ipynb.metadata?.kernelspec?.language?.toLowerCase()
        options = immutable.fromJS
            markdown : undefined
            options  : cm_options(mode)
        @setState
            cells      : cells
            cell_list  : cell_list
            cm_options : options

    close: =>
        delete @store
        delete @client
        @_state = 'closed'