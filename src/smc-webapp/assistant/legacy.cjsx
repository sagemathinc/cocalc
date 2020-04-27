
# CoCalc libs
{defaults, required, optional} = misc = require('smc-util/misc')
# react aspects
{React, ReactDOM, redux, Redux} = require('../app-framework')

# Assistant functions
{SnippetsDialog} = require('./dialog')
{redux_name, init_action_and_store} = require('./main')

# This is a legacy wrapper, which is used in editor.coffee for sagews worksheets.
# "target" is a DOM element somewhere in the buttonbar of the editor's html
exports.render_snippets_dialog = (opts) ->
    opts = defaults opts,
        target     : required
        project_id : required
        path       : required
        lang       : 'sage'
    name = redux_name(opts.project_id, opts.path)
    actions = redux.getActions(name)
    if not actions?
        [actions, store] = init_action_and_store(name, opts.project_id, opts.path)
    actions.init(opts.lang)
    actions.set(lang_select:true)
    dialog = <Redux redux={redux}>
                 <SnippetsDialog actions={actions} name={name}/>
             </Redux>
    ReactDOM.render(dialog, opts.target)
    return actions
