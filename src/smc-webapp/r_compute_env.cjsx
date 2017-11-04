##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2017, Sagemath Inc.
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

{redux, Redux, rclass, rtypes, React, Actions, Store} = require('./smc-react')
{Loading} = require('./r_misc')
schema = require('smc-util/schema')
misc   = require('smc-util/misc')
theme  = require('smc-util/theme')

name   = 'compute_environment'


ComputeEnvironmentStore =
    inventory   : {}
    components  : {}
    loaded      : false

class ComputeEnvironmentActions extends Actions
    get: (key) ->
        @redux.getStore(@name).get(key)

    init_data: (inventory, components) ->
        @setState(
            inventory  : inventory
            components : components
        )

    load: ->
        return if @get('loading')
        @setState(loading: true)
        require.ensure [], =>
            inventory  = require('webapp-lib/compute-inventory.json')
            components = require('webapp-lib/compute-components.json')
            @init_data(inventory, components)

actions  = redux.createActions(name, ComputeEnvironmentActions)
store    = redux.createStore(name, ComputeEnvironmentStore)

ComputeEnvironment = rclass
    displayName : 'ComputeEnvironment'

    reduxProps :
        "#{name}" :
            inventory : rtypes.object
            loaded    : rtypes.bool

    propTypes :
        actions   : rtypes.object

    componentDidMount: ->
        @props.actions.load()

    render: ->
        <div>{misc.to_json(@props.inventory)} - {misc.to_json(@props.loaded)}</div>


exports.ComputeEnvironment = ->
    displayName : 'ComputeEnvironment-redux'

    render: ->
        <Redux redux={redux}>
            <ComputeEnvironment actions={actions} />
        </Redux>
