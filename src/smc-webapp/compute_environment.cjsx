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

{Col, Row, Panel, Table, Tab, Tabs, Modal, Button} = require('react-bootstrap')
{redux, Redux, rclass, rtypes, React, Actions, Store} = require('./app-framework')
{Loading, Markdown} = require('./r_misc')
{HelpEmailLink, SiteName} = require('./customize')
{ Column, Table } = require('react-virtualized')

schema = require('smc-util/schema')
misc   = require('smc-util/misc')
theme  = require('smc-util/theme')

# This depends on two files: compute-inventory.json and compute-components.json described in webapp-lib/README.md

NAME   = 'compute_environment'

# utils
full_lang_name = (lang) ->
    switch lang
        when 'R'
            return 'R Project'
    return lang.charAt(0).toUpperCase() + lang[1..]

by_lowercase = (a, b) ->
    return a.toLowerCase().localeCompare(b.toLowerCase())

###
stateTypes:
    inventory     : rtypes.object
    components    : rtypes.object
    langs         : rtypes.arrayOf(rtypes.string)
    loading       : rtypes.bool
    selected_lang : rtypes.string
###
class ComputeEnvironmentStore extends Store
    getInitialState: ->
        inventory      : undefined
        components     : undefined
        langs          : undefined
        selected_lang  : 'executables'  # default to 'executables' this since it is MUCH shorter than the others, is the first tab (so faster to render!), and makes no assumptions about if the user is a "Python person" or "R person" or whatever.
        loading        : false


class ComputeEnvironmentActions extends Actions
    get: (key) ->
        @redux.getStore(@name).get(key)

    init_data: (inventory, components) ->
        # both are empty objects by default
        langs = (k for k, v of inventory when k isnt 'language_exes')
        langs.sort(by_lowercase)
        @setState(
            langs     : langs
            inventory : inventory
            components: components
        )
        #if DEBUG then console.log(inventory, components, langs)

    load: ->
        return if @get('loading')
        @setState(loading: true)
        if DEBUG then console.log("ComputeEnvironmentActions: loading ...")
        require.ensure [], =>
            # these files only contain "{}" per default!
            inventory  = require('webapp-lib/compute-inventory.json')
            components = require('webapp-lib/compute-components.json')
            @init_data(inventory, components)
            if DEBUG then console.log("ComputeEnvironmentActions: loading done.")


# the components

Executables = rclass
    displayName : 'ComputeEnvironment-Executables'

    propTypes:
        inventory     : rtypes.object.isRequired    # already language-specific
        components    : rtypes.object.isRequired    # already language-specific

    render: ->
        style =
            maxHeight    : '12rem'
            overflowY    : 'auto'
            fontSize     : '80%'

        execs = misc.keys(@props.inventory)
        name  = ((x) => @props.components[x].name)
        execs.sort(((a, b) -> by_lowercase(name(a), name(b))))
        for exec in execs
            stdout = @props.inventory[exec]
            <Row key={exec} style={margin: '2rem 0 2rem 0'}>
                <Col md={3}>
                    <b>{name(exec)}</b>
                    <br/>
                    <code style={fontSize: '80%'}>{exec}</code>
                </Col>
                <Col md={9}>
                    <pre style={style}>
                        {stdout}
                    </pre>
                </Col>
            </Row>

LanguageTable = rclass
    displayName : 'ComputeEnvironment-LanguageTable'

    propTypes:
        lang          : rtypes.string.isRequired
        inventory     : rtypes.object.isRequired    # already language-specific
        components    : rtypes.object.isRequired    # already language-specific
        lang_exes     : rtypes.object.isRequired
        version_click : rtypes.func.isRequired

    lang_table_header: ->
        <thead>
            <tr>
                <th key={'__package'}>Package</th>
                {
                    for inventory_idx of @props.inventory
                        <th
                            key    = {inventory_idx}
                            style  = {whiteSpace: 'nowrap'}
                        >
                            {@props.lang_exes[inventory_idx].name}
                        </th>
                }
            </tr>
        </thead>


    lang_table_body_row_versions: (component_idx) ->
        for inventory_idx, inventory_info of @props.inventory
            do (inventory_idx) =>
                info = inventory_info[component_idx]
                <td
                    key        = {inventory_idx}
                    style      = {cursor: 'pointer' if info?}
                    onClick    = {(=> @props.version_click(inventory_idx, component_idx)) if info?}
                >
                    {info ? ''}
                </td>

    lang_table_body_row_name: (component_idx) ->

        style =
            fontWeight  : 'bold'
        summary =
            fontSize    : '80%'

        component_info = @props.components[component_idx]
        if component_info
            <td key={'__name'}>
                <div style={style}>
                {
                    if component_info.url
                        <a target='_blank' href={component_info.url}>{component_info.name}</a>
                    else
                        component_info.name
                }
                </div>
                {<div style={summary}>{component_info.summary}</div> if component_info.summary}
            </td>
        else
            <td key={'name'}>
                <div style={style}>{component_idx}</div>
            </td>

    lang_table_body_row: (component_idx) ->
        <tr key={component_idx}>
            {@lang_table_body_row_name(component_idx)}
            {@lang_table_body_row_versions(component_idx)}
        </tr>

    lang_table_body: ->
        <tbody>
        {
            component_idxs = (k for k, v of @props.components)
            component_idxs.sort((a, b) =>
                return a.localeCompare(b)
                # TOOD make this below here work
                #name_a = (@props.components[a] ? a).toLowerCase()
                #name_b = (@props.components[b] ? b).toLowerCase()
                #return name_a.localeCompare(name_b)
            )
            for component_idx in component_idxs
                @lang_table_body_row(component_idx)
        }
        </tbody>

    render: ->
        <Table striped bordered condensed hover>
            {@lang_table_header()}
            {@lang_table_body()}
        </Table>

SoftwareTable = rclass
    displayName : 'ComputeEnvironment-SoftwareTable'

    shouldComponentUpdate: (props) ->
        return @props.lang != props.lang

    propTypes:
        lang          : rtypes.string.isRequired
        inventory     : rtypes.object.isRequired
        components    : rtypes.object.isRequired
        lang_exes     : rtypes.object.isRequired
        version_click : rtypes.func.isRequired

    render: ->
        if @props.lang is 'executables'
            <Executables
                inventory    = {@props.inventory}
                components   = {@props.components}/>
        else
            <LanguageTable
                lang          = {@props.lang}
                version_click = {@props.version_click}
                inventory     = {@props.inventory}
                components    = {@props.components}
                lang_exes     = {@props.lang_exes}/>




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

    shouldComponentUpdate: (props) ->
        if props.selected_lang != @props.selected_lang  # tab change
            return true
        # Otherwise, only update if neither is defined -- if both defined, no further updates needed.
        # Without this, if you wwitch to the "i CoCalc" page in prod, then
        # click "Help" and try to type it's a total disaster.
        return not @props.inventory? or not @props.components?

    getInitialState: ->
        show_version_popup : false
        inventory_idx      : ''
        component_idx      : ''

    version_click: (inventory_idx, component_idx) ->
        #if DEBUG then console.log inventory_idx, component_idx
        @setState(
            show_version_popup : true
            inventory_idx      : inventory_idx
            component_idx      : component_idx
        )

    version_close: ->
        @setState(show_version_popup: false)

    version_information_popup: ->
        {li_style} = require('./r_help')

        lang_info          = @props.inventory['language_exes'][@state.inventory_idx]
        version            = @props.inventory[@props.selected_lang]?[@state.inventory_idx]?[@state.component_idx] ? '?'
        # we're optimistic and treat 'description' as markdown,
        # but in reality it might be plaintext, Rst or HTML
        component_info     = @props.components[@props.selected_lang]?[@state.component_idx]
        description        = component_info?.descr
        # doc is often an html link, but sometimes not.
        # Hence we treat it as an arbitrary string and use Markdown to turn it into a URL if possible.
        doc                = component_info?.doc
        url                = component_info?.url
        name               = component_info?.name
        lang_env_name      = lang_info?.name ? @state.inventory_idx
        jupyter_bridge_url = "https://github.com/sagemathinc/cocalc/wiki/sagejupyter#-question-how-do-i-start-a-jupyter-kernel-in-a-sage-worksheet"
        style_descr =
            maxHeight   : '12rem'
            overflowY   : 'auto'

        <Modal
            key        = {'modal'}
            show       = {@state.show_version_popup}
            onHide     = {@version_close}
            animation  = {false}
        >
            <Modal.Header closeButton>
                <Modal.Title>Library <b>{@state.component_idx}</b> ({version})</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p style={fontWeight: 'bold'}>
                    The library{' '}
                    {
                        if url
                            <a target='_blank' href={url}>{name}</a>
                        else
                            name
                    }{' '}
                    is available in version {version}{' '}
                    as part of the {lang_env_name} environment.
                </p>
                {
                    <p>
                        <Markdown value={"Documentation: #{doc}"} />
                    </p> if doc?
                }
                {
                    <p style={style_descr}>
                        <Markdown value={description} />
                    </p> if description?
                }
                <p>
                    You can access it by
                </p>
                <ul>
                    <li style={li_style}>selecting the appropriate Kernel in a Jupyter Notebook,</li>
                    <li style={li_style}>load it from within a SageMath Worksheet via the{' '}
                        <a target='_blank' href={jupyter_bridge_url}>Jupyter Bridge</a>.
                        E.g. for Anaconda:
                        <pre>
                            %auto
                            anaconda3 = jupyter('anaconda3')
                            %default_mode anaconda3
                        </pre>
                    </li>
                    <li style={li_style}>or run it in a Terminal ("Files" → "Terminal")</li>
                </ul>
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={@version_close}>Close</Button>
            </Modal.Footer>
        </Modal>

    render_tab_content: (lang) ->
        if lang != @props.selected_lang
            return <span/>
        <div style={height: '75vh', overflowY: 'scroll', overflowX: 'hidden'}>
            <SoftwareTable
                lang          = {lang}
                version_click = {@version_click}
                inventory     = {@props.inventory[lang]}
                components    = {@props.components[lang]}
                lang_exes     = {@props.inventory['language_exes']}
            />
        </div>

    render_control_tabs: ->
        for lang in @props.langs
            <Tab key={lang} eventKey={lang} title={full_lang_name(lang)}>
                {@render_tab_content(lang)}
            </Tab>

    tabs: ->
        <Tabs
            key={'tabs'}
            activeKey={@props.selected_lang}
            onSelect={((key) => @props.actions.setState(selected_lang:key))}
            animation={false}
            id={"about-compute-environment-tabs"}
        >
            {@render_control_tabs()}
        </Tabs>

    environment_information: ->
        {li_style} = require('./r_help')

        num = {}
        for env in ['R', 'julia', 'python', 'executables']
            num[env] = misc.keys(@props.components[env] ? {}).length ? 0
        num.language_exes = misc.keys(@props.inventory['language_exes'] ? {}).length ? 0
        execs = @props.inventory['language_exes'] ? {}
        exec_keys = misc.keys(execs)
        exec_keys.sort((a, b) ->
            return by_lowercase(execs[a].name, execs[b].name)
        )

        <div key={'intro'} style={marginBottom: '20px'}>
            <p>
                <SiteName /> offers a comprehensive collection of software environments and libraries.{' '}
                There are {num.python} Python packages, {num.R} R packages, {num.julia} Julia libraries{' '}
                and more than {num.executables} executables installed.{' '}
                Click on a version number to learn more about the particular library.
            </p>
            <p>
                This overview shows {num.language_exes} programming language environments:
            </p>
            <ul styke={margin: '10px 0'}>
            {
                for k in exec_keys
                    info = execs[k]
                    <li key={k} style={li_style}>
                        <b>
                            <a href={info.url} target='_blank'>{info.name}</a>{':'}
                        </b>
                        {' '}
                        {info.doc}
                    </li>
            }
            </ul>
        </div>

    ui: ->
        [
            @version_information_popup()
            @environment_information()
            @tabs()
        ]

    render: ->
        <Row>
            <hr/>
            <h3>Software and Programming Libraries Details</h3>
            {
                if @props.inventory? and @props.components?
                    if @props.langs?.length > 0
                        @ui()
                    else
                        # Only shown if explicitly requested but no data available
                        'Compute environment information not available.'
                else
                    <Loading/>
            }
        </Row>


# react magic

store    = redux.createStore(NAME, ComputeEnvironmentStore)
actions  = redux.createActions(NAME, ComputeEnvironmentActions)

exports.ComputeEnvironment = rclass
    displayName : 'ComputeEnvironment-redux'

    reduxProps :
        customize :
            kucalc : rtypes.string

    render: ->
        if @props.kucalc != 'yes'
            return <span />
        <Redux redux={redux}>
            <ComputeEnvironment actions={actions} />
        </Redux>
