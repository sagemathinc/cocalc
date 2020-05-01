#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# Snippets Dialog
# This is a modal dialog, which downloads a hierarchical collection of code snippets
# with descriptions. It returns an object, containing the code and the language:
# {"code": "...", "lang" : "..."} via a given callback.
#
# The canonical project creating the appropriate datastructure is
# https://github.com/sagemathinc/cocalc-assistant
#
# Usage:
# w = render_snippets_dialog(target, project_id, filename, lang)
#     * target: jquery dom object, where react is put into
#     * project_id and filename to make state in redux unique
#     * lang is the mode (sage, r, python, ...)
# use 'w.set_handler' to set the handler that's used for inserting the selected document
# API (implemented in SnippetsActions)
# w.show([lang]) -- show dialog again (same state!) and in csae a language given, a selection of it is triggered

# cocalc libs
{defaults, required, optional} = misc = require('smc-util/misc')
{redux, Redux} = require('../app-framework')
# snippets related libs
{ExamplesStore} = require('./store')
{ExamplesActions}   = require('./actions')

### Private API ###

exports.redux_name = (project_id, path) ->
    return "examples-#{project_id}-#{path}"

exports.init_action_and_store = (name, project_id, path) ->
    store   = redux.createStore(name, ExamplesStore)
    actions = redux.createActions(name, ExamplesActions)
    actions._init(store, project_id, path)
    return [actions, store]

### Public API ###

# The following two exports are used in jupyter/main and ./register
exports.instantiate_snippets = (project_id, path) ->
    name = exports.redux_name(project_id, path)
    actions = redux.getActions(name)
    if not actions?
        [actions, store] = exports.init_action_and_store(name, project_id, path)
    return actions
