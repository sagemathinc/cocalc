##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2015 -- 2018, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

# CoCalc libs
{defaults, required, optional} = misc = require('smc-util/misc')
# react aspects
{React, ReactDOM, redux, Redux} = require('../app-framework')

# Assistant functions
{ExamplesDialog} = require('./dialog')
{redux_name, init_action_and_store} = require('./main')

# This is a legacy wrapper, which is used in editor.coffee for sagews worksheets.
# "target" is a DOM element somewhere in the buttonbar of the editor's html
exports.render_examples_dialog = (opts) ->
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
                 <ExamplesDialog actions={actions} name={name}/>
             </Redux>
    ReactDOM.render(dialog, opts.target)
    return actions
