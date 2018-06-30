###
Register the Jupyter Notebook editor and viwer with CoCalc
  - set the file extension, icon, react component,
    and how to init and remove the actions/store

This is in a separate module from the main non-public version, so it can
be used on the backend.
###

{register_file_editor} = require('../file-editors')
{redux_name}           = require('../app-framework')

{NBViewer}             = require('./nbviewer')
{NBViewerActions}      = require('./nbviewer-actions')

exports.register = (webapp_client) ->
    register_file_editor
        ext       : ['ipynb']

        is_public : true

        icon      : 'list-alt'

        component : NBViewer

        init      : (path, redux, project_id, content) ->
            name = redux_name(project_id, path)
            if redux.getActions(name)?
                return name  # already initialized
            store   = redux.createStore(name)
            actions = redux.createActions(name, NBViewerActions)
            actions._init(project_id, path, store, webapp_client, content)
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
