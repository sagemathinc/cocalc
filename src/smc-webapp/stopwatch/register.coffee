###
Register the time editor -- stopwatch
  - set the file extension, icon, react component,
    and how to init and remove the actions/store
###

{register_file_editor} = require('../project_file')
{redux_name}           = require('../smc-react')
{webapp_client}        = require('../webapp_client')
{alert_message}        = require('../alerts')

{EditorTime}           = require('./editor')
{TimeActions}          = require('./actions')

register_file_editor
    ext       : ['time']

    is_public : false

    icon      : 'clock-o'

    component : EditorTime

    init      : (path, redux, project_id) ->
        name = redux_name(project_id, path)
        if redux.getActions(name)?
            return name  # already initialized

        actions = redux.createActions(name, TimeActions)
        store   = redux.createStore(name)

        actions._init(project_id, path)

        syncdb = webapp_client.sync_db
            project_id   : project_id
            path         : path
            primary_keys : ['id']
            string_cols  : ['label']
        actions.syncdb = syncdb
        actions.store  = store
        syncdb.once 'init', (err) =>
            if err
                mesg = "Error opening '#{path}' -- #{err}"
                console.warn(mesg)
                alert_message(type:"error", message:mesg)
                return
            actions._syncdb_change()
            syncdb.on('change', actions._syncdb_change)
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
