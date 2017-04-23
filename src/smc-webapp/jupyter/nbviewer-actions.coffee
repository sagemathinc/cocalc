"""
Redux actions for nbviewer.

"""

{Actions}  = require('../smc-react')

class exports.NBViewerActions extends Actions
    _init: (project_id, path, store, client) =>
        @store  = store
        @client = client
        @setState
            project_id : project_id
            path       : path
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
                        @setState(ipynb: JSON.parse(data))
                    catch err
                        @setState(error: "Error parsing -- #{err}")

    close: =>
        delete @store
        delete @client
        @_state = 'closed'