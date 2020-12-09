#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

require("./compute-environment");  # replacing this

{ Panel, Table, Tab, Tabs, Modal, Button} = require('react-bootstrap')
{ Col, Row } = require("./antd-bootstrap")
{redux, Redux, rclass, rtypes, React} = require('./app-framework')
{Loading, Markdown} = require('./r_misc')
{HelpEmailLink, SiteName} = require('./customize')

schema = require('smc-util/schema')
misc   = require('smc-util/misc')
theme  = require('smc-util/theme')
{li_style} = require('./info/style')


# This depends on two files: compute-inventory.json and compute-components.json described in webapp-lib/README.md

{ full_lang_name, by_lowercase, SoftwareTable } = require('./compute-environment')

NAME = "compute-environment"


# the components




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

    shouldComponentUpdate: (props, state) ->
        if props.selected_lang != @props.selected_lang  # tab change
            return true
        if state.show_version_popup != @state.show_version_popup
            return true
        # Otherwise, only update if neither is defined -- if both defined, no further updates needed.
        # Without this, if you switch to the "i CoCalc" page in prod, then
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
        lang_info          = @props.inventory['language_exes'][@state.inventory_idx]
        return if not lang_info?
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
        jupyter_kernel = switch lang_info.lang
            when 'julia'  then 'julia-1.4'
            when 'python' then 'python3'
            when 'octave' then 'octave'
            when 'R'      then 'ir'
            else lang_info.lang

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
                            <a target='_blank'  rel="noopener" href={url}>{name}</a>
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
                        <a target='_blank' rel="noopener" href={jupyter_bridge_url}>Jupyter Bridge</a>.
                        E.g. for Anaconda:
                        <pre>
                            kernel = jupyter('{jupyter_kernel}')1
                            %default_mode kernel
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
            style={width: "100%"}
            id={"about-compute-environment-tabs"}
        >
            {@render_control_tabs()}
        </Tabs>

    environment_information: ->
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
                            <a href={info.url} rel="noopener" target='_blank'>{info.name}</a>{':'}
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
            <Col>
                <h3>Software and Programming Libraries Details</h3>
                {
                    if @props.inventory? and @props.components?
                        if @props.langs?.length > 0
                            @ui()
                        else
                            # Only shown if explicitly requested but no data available
                            <div>Compute environment information not available.</div>
                    else
                        <Loading/>
                }
            </Col>
        </Row>


# react magic

exports.ComputeEnvironment = rclass
    displayName : 'ComputeEnvironment-redux'

    reduxProps :
        customize :
            kucalc : rtypes.string

    render: ->
        if @props.kucalc != 'yes'
            return <span />
        <Redux redux={redux}>
            <ComputeEnvironment actions={redux.getActions(NAME)} />
        </Redux>
