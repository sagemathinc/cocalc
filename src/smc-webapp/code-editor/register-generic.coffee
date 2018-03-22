###
Generic register function -- for code editor or other similar derived editors.

Basically, this is like register_file_editor, but much more specialized.
###

misc                   = require('smc-util/misc')
{defaults, required}   = misc

{register_file_editor} = require('../file-editors')
{redux_name}           = require('../smc-react')

exports.register_file_editor = (opts) ->
    opts = defaults opts,
        ext       : required
        component : required
        Actions   : undefined
        Store     : undefined
    for is_public in [true, false]
        register(opts.ext, opts.component, opts.Actions, opts.Store, is_public)

register = (ext, component, Actions, Store, is_public) ->
    register_file_editor
        ext       : ext

        is_public : is_public

        component : component

        init      : (path, redux, project_id) ->
            name = redux_name(project_id, path, is_public)
            if redux.getActions(name)?
                return name  # already initialized
            actions = redux.createActions(name, Actions)
            store   = redux.createStore(name,   Store)
            actions._init(project_id, path, is_public, store)

            return name

        remove    : (path, redux, project_id) ->
            name = redux_name(project_id, path, is_public)
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
            redux.getActions(redux_name(project_id, path))?.save()

