"""
Redux actions for nbviewer.

"""

{Actions}  = require('../smc-react')

{cm_options} = require('./cm_options')

immutable = require('immutable')

util = require('./util')

{IPynbImporter} = require('./import-from-ipynb')

class exports.NBViewerActions extends Actions
    _init: (project_id, path, store, client) =>
        @store  = store
        @client = client
        @setState
            project_id : project_id
            path       : path
            font_size  : @redux.getStore('account')?.get('font_size') ? 14
        @_state = 'ready'
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
                if type.split('/')[0] == 'image'
                    content.data[type] = {value:content.data[type]}

    set_from_ipynb: (ipynb) =>
        importer = new IPynbImporter()
        importer.import
            ipynb   : ipynb
            process : @_process
        cells      = immutable.fromJS(importer.cells())
        cell_list  = util.sorted_cell_list(cells)
        options = immutable.fromJS
            markdown : undefined
            options  : cm_options()   # TODO
        @setState
            cells      : cells
            cell_list  : cell_list
            cm_options : options

    close: =>
        delete @store
        delete @client
        @_state = 'closed'