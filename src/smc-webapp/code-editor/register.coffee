###
Register the code editor
###

misc                   = require('smc-util/misc')

{register_file_editor} = require('../file-editors')
{alert_message}        = require('../alerts')
{redux_name}           = require('../smc-react')
{webapp_client}        = require('../webapp_client')

{Editor}               = require('./editor')
{Actions}              = require('./actions')
{Store}                = require('./store')

exports.register = ->
    register_file_editor
        ext       : ['txt2']  # for testing for now.

        is_public : false

        icon      : 'tasks'  # TODO

        component : Editor

        init      : (path, redux, project_id) ->
            name = redux_name(project_id, path)
            if redux.getActions(name)?
                return name  # already initialized

            actions = redux.createActions(name, Actions)
            store   = redux.createStore(name, Store)

            syncstring = webapp_client.sync_string
                id                 : require('smc-util/schema').client_db.sha1(project_id, path)
                project_id         : project_id
                path               : path
                cursors            : true
                before_change_hook : actions.set_syncstring_to_codemirror
                after_change_hook  : actions.set_codemirror_to_syncstring

            if window.smc?
                window.a = actions # for DEBUGGING

            actions._init(project_id, path, syncstring, store)

            syncstring.once 'init', (err) =>
                if err
                    mesg = "Error opening '#{path}' -- #{err}"
                    console.warn(mesg)
                    alert_message(type:"error", message:mesg)
                    return

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

        save      : (path, redux, project_id) ->
            name = redux_name(project_id, path)
            actions = redux.getActions(name)
            actions?.save()

exports.register()
