
###
Register this editor with SMC
  - set the file extension, icon, react component,
    and how to init and remove the actions/store
###

misc                   = require('smc-util/misc')

{register_file_editor} = require('../project_file')
{salvus_client}        = require('../salvus_client')
{alert_message}        = require('../alerts')
{redux_name}           = require('../smc-react')

{JupyterEditor}        = require('./main')
{JupyterActions}       = require('./actions')
{JupyterStore}         = require('./store')

register_file_editor
    ext       : ['ipynb2']

    is_public : false

    icon      : 'list-alt'

    component : JupyterEditor

    init      : (path, redux, project_id) ->
        name = redux_name(project_id, path)
        if redux.getActions(name)?
            return name  # already initialized

        actions = redux.createActions(name, JupyterActions)
        store   = redux.createStore(name, JupyterStore)

        actions._init()

        syncdb = salvus_client.sync_db
            project_id   : project_id
            path         : misc.meta_file(path, 'cocalc')  # TODO
            primary_keys : ['type', 'id']
            string_cols  : ['input']

        actions.syncdb = syncdb
        actions.store  = store

        # Useful to know.
        actions._project_id = project_id
        actions._path = path
        actions._directory = misc.path_split(path).head

        window.a = actions # for DEBUGGING

        syncdb.once 'init', (err) =>
            if err
                mesg = "Error opening '#{path}' -- #{err}"
                console.warn(mesg)
                alert_message(type:"error", message:mesg)
                return
            actions._syncdb_change()
            syncdb.on('change', actions._syncdb_change)  # TODO: make efficient

        return name

    remove    : (path, redux, project_id) ->
        name = redux_name(project_id, path)
        actions = redux.getActions(name)
        actions?.syncdb?.close()
        store = redux.getStore(name)
        if not store?
            return
        delete store.state
        # It is *critical* to first unmount the store, then the actions,
        # or there will be a huge memory leak.
        redux.removeStore(name)
        redux.removeActions(name)
        return name
