###
Register the Jupyter Notebook editor and viwer with SMC
  - set the file extension, icon, react component,
    and how to init and remove the actions/store
###

misc                   = require('smc-util/misc')

{register_file_editor} = require('../project_file')
{webapp_client}        = require('../webapp_client')
{alert_message}        = require('../alerts')
{redux_name}           = require('../smc-react')

{JupyterEditor}        = require('./main')
{JupyterActions}       = require('./actions')
{JupyterStore}         = require('./store')

{NBViewer}             = require('./nbviewer')
{NBViewerActions}      = require('./nbviewer-actions')

exports.register = ->
    register_file_editor
        ext       : ['ipynb']

        is_public : false

        icon      : 'list-alt'

        component : JupyterEditor

        init      : (path, redux, project_id) ->
            name = redux_name(project_id, path)
            if redux.getActions(name)?
                return name  # already initialized

            actions = redux.createActions(name, JupyterActions)
            store   = redux.createStore(name, JupyterStore)

            syncdb = webapp_client.sync_db
                project_id      : project_id
                path            : misc.meta_file(path, 'jupyter2')   # a.ipynb --> ".a.ipynb.sage-jupyter2"
                change_throttle : 5    # our UI/React can handle more rapid updates; plus we want output FAST.
                patch_interval  : 5
                save_interval   : 1500
                primary_keys    : ['type', 'id']
                string_cols     : ['input']
                cursors         : true

            actions._init(project_id, path, syncdb, store, webapp_client)

            ##if window.smc?
            ##    window.a = actions # for DEBUGGING

            syncdb.once 'init', (err) =>
                if err
                    mesg = "Error opening '#{path}' -- #{err}"
                    console.warn(mesg)
                    alert_message(type:"error", message:mesg)
                    return
                if syncdb.count() == 0
                    actions._syncdb_change()  # cause initialization -- TODO: will get moved to backend/project.

            return name

        remove    : (path, redux, project_id) ->
            name = redux_name(project_id, path)
            actions = redux.getActions(name)
            actions?.close()
            store = redux.getStore(name)
            if not store?
                return
            delete store.state
            redux.removeStore(name)
            redux.removeActions(name)
            return name


    register_file_editor
        ext       : ['ipynb']

        is_public : true

        icon      : 'list-alt'

        component : NBViewer

        init      : (path, redux, project_id) ->
            name = redux_name(project_id, path)
            if redux.getActions(name)?
                return name  # already initialized
            actions = redux.createActions(name, NBViewerActions)
            store   = redux.createStore(name)
            actions._init(project_id, path, store, webapp_client)
            return name

        remove    : (path, redux, project_id) ->
            name = redux_name(project_id, path)
            actions = redux.getActions(name)
            actions?.close()
            store = redux.getStore(name)
            if not store?
                return
            delete store.state
            redux.removeStore(name)
            redux.removeActions(name)
            return name

exports.register()
