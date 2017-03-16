###
Jupyter Backend
###


exports.jupyter_backend = (syncdb, client) ->
    dbg = client.dbg("jupyter_backend")
    dbg()
    {JupyterActions} = require('smc-webapp/jupyter/actions')
    {JupyterStore}   = require('smc-webapp/jupyter/store')
    smc_react        = require('smc-webapp/smc-react')

    project_id = client.client_id()
    path       = syncdb._path
    redux_name = smc_react.redux_name(project_id, path)
    actions    = new JupyterActions(redux_name, smc_react.redux)
    store      = new JupyterStore(redux_name, smc_react.redux)

    actions._init(project_id, path, syncdb, store, client)

    syncdb.once 'init', (err) ->
        dbg('syncdb init complete #{err}')
        # actions.set_cell_output("dca12d72", ['5', '10'])
