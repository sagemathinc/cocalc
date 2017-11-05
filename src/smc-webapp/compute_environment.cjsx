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

{Col, Row, Panel, Table, Tab, Tabs} = require('react-bootstrap')
{redux, Redux, rclass, rtypes, React, Actions, Store} = require('./smc-react')
{Loading} = require('./r_misc')
schema = require('smc-util/schema')
misc   = require('smc-util/misc')
theme  = require('smc-util/theme')

NAME   = 'compute_environment'


ComputeEnvironmentStore =
    name: NAME

    getInitialState: ->
        inventory   : undefined
        components  : undefined
        langs       : undefined
        loading     : false

    stateTypes:
        inventory     : rtypes.object
        components    : rtypes.object
        langs         : rtypes.arrayOf(rtypes.string)
        loading       : rtypes.bool
        selected_lang : rtypes.string


class ComputeEnvironmentActions extends Actions
    get: (key) ->
        @redux.getStore(@name).get(key)

    init_data: (inventory, components) ->
        @setState(inventory:inventory, components:components)
        @setState(langs: (k for k, v of inventory when k isnt 'language_exes'))

    load: ->
        return if @get('loading')
        @setState(loading: true)
        if DEBUG then console.log("ComputeEnvironmentActions: loading ...")
        require.ensure [], =>
            inventory  = require('webapp-lib/compute-inventory.json')
            components = require('webapp-lib/compute-components.json')
            @init_data(inventory, components)
            if DEBUG then console.log("ComputeEnvironmentActions: loading done.")


# utils
full_lang_name = (lang) ->
    switch lang
        when 'r'
            return 'R Project'
    return lang.charAt(0).toUpperCase() + lang[1..]


# the components

Executables = rclass
    displayName : 'ComputeEnvironment-Executables'

    propTypes:
        inventory     : rtypes.object.isRequired    # already language-specific
        components    : rtypes.object.isRequired    # already language-specific

    executables_list: ->
        for i in [0..100]
            <li key={i}>Executable {i}</li>

    render: ->
        <ul>
            {@executables_list()}
        </ul>

LanguageTable = rclass
    displayName : 'ComputeEnvironment-LanguageTable'

    propTypes:
        lang          : rtypes.string.isRequired
        inventory     : rtypes.object.isRequired    # already language-specific
        components    : rtypes.object.isRequired    # already language-specific
        lang_exes     : rtypes.object.isRequired

    lang_table_header: ->
        <thead>
            <tr>
                <th key={''}></th>
                {
                    for inventory_idx of @props.inventory
                        <th key={inventory_idx}>{@props.lang_exes[inventory_idx].name}</th>
                }
            </tr>
        </thead>

    lang_table_body_row_versions: (component_idx) ->
        for inventory_idx, inventory_info of @props.inventory
            <td key={inventory_idx}>version {component_idx}</td>

    lang_table_body_row_name: (component_idx, component_info) ->
        if component_info
            <th key={'name'}>
            <div>
            {
                if component_info.url
                    <a href={component_info.url}>{component_info.name}</a>
                else
                    component_info.name
            }
            </div>
            {<div>{component_info.summary}</div> if component_info.summary}
            </th>
        else
            <th key={'name'}>{component_idx}</th>

    lang_table_body_row: (component_idx, component_info) ->
        <tr key={component_idx}>
            {@lang_table_body_row_name(component_idx, component_info)}
            {@lang_table_body_row_versions(component_idx)}
        </tr>

    lang_table_body: ->
        <tbody>
        {
            for component_idx, component_info of @props.components
                @lang_table_body_row(component_idx, component_info)
        }
        </tbody>

    render: ->
        <Table striped bordered condensed hover>
            {@lang_table_header()}
            {@lang_table_body()}
        </Table>

ComputeEnvironment = rclass
    displayName : 'ComputeEnvironment'

    reduxProps :
        "#{NAME}" :
            inventory     : rtypes.object
            components    : rtypes.object
            selected_lang : rtypes.string
            langs         : rtypes.arrayOf(rtypes.string)

    propTypes :
        actions : rtypes.object

    componentDidMount: ->
        @props.actions.load()

    getInitialState: ->
        selected_lang: 'python'

    body: (lang) ->
        # why is lang sometimes undefined?
        return if not lang?
        <div style={height: '60vh', overflowY: 'scroll'}>
        {
            if lang is 'executables'
                <Executables
                    inventory    = {@props.inventory[lang]}
                    components   = {@props.components[lang]}/>
            else
                <LanguageTable
                    lang         = {lang}
                    inventory    = {@props.inventory[lang]}
                    components   = {@props.components[lang]}
                    lang_exes    = {@props.inventory['language_exes']}/>
        }
        </div>

    control_tabs: ->
        for lang in @props.langs
            <Tab key={lang} eventKey={lang} title={full_lang_name(lang)}>{@body(lang)}</Tab>

    controls: ->
        <Tabs
            activeKey={@props.selected_lang}
            onSelect={((key) => @setState(selected_lang:key))}
            id={"about-compute-environment-tabs"}
        >
            {@control_tabs()}
        </Tabs>

    main: ->
        <Row>
            <hr/>
            <h3>Available Software and Programming Libraries</h3>
            {@controls()}
            {@body()}
        </Row>

    render: ->
        return <Loading/> if not (@props.inventory and @props.components and @props.langs?.length > 0)
        @main()


# react magic

actions  = redux.createActions(NAME, ComputeEnvironmentActions)
store    = redux.createStore(ComputeEnvironmentStore)

exports.ComputeEnvironment = ->
    displayName : 'ComputeEnvironment-redux'

    render: ->
        return if not KUCALC_COMP_ENV
        <Redux redux={redux}>
            <ComputeEnvironment actions={actions} />
        </Redux>
