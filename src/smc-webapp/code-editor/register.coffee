###
Register the code editor
###

misc                   = require('smc-util/misc')

{register_file_editor} = require('../file-editors')
{alert_message}        = require('../alerts')
{redux_name}           = require('../smc-react')
{file_associations}    = require('../file-associations')

{Editor}               = require('./editor')
{Actions}              = require('./actions')

register = (is_public) ->
    register_file_editor
        ext       : (key for key, value of file_associations when value.editor == 'codemirror')

        is_public : is_public

        component : Editor

        init      : (path, redux, project_id) ->
            name = redux_name(project_id, path, is_public)
            if redux.getActions(name)?
                return name  # already initialized

            actions = redux.createActions(name, Actions)
            store   = redux.createStore(name)
            actions._init(project_id, path, is_public, store)

            return name

        remove    : (path, redux, project_id) ->
            name = redux_name(project_id, path)
            actions = redux.getActions(name)
            if actions?
                actions.close()
                redux.removeActions(name)
            store = redux.getStore(name)
            if store?
                delete store.state
                redux.removeStore(name)
            return name

        save      : (path, redux, project_id) ->
            # TODO: this should be the default, right?
            redux.getActions(redux_name(project_id, path))?.save()

for is_public in [false]
    register(is_public)