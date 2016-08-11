{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

{Alert, Button, ButtonToolbar, ButtonGroup, Input, Row, Col,
    Panel, Popover, Tabs, Tab, Well} = require('react-bootstrap')

{ProjectFilesGenerator} = require('./project_files')
{ProjectNewGenerator} = require('./project_new')
{ProjectLogGenerator} = require('./project_log')
{ProjectSearchGenerator} = require('./project_search')
{ProjectSettingsGenerator} = require('./project_settings')

{ProjectStore} = require('./project_store')

ProjectPageGenerator = (name) -> console.log("Generating Project page class!"); rclass

    reduxProps :
        projects :
            project_map : rtypes.immutable
        "#{name}" :
            active_tab : rtypes.string

    propTypes :
        redux           : rtypes.object
        project_id      : rtypes.string.isRequired
        project_store   : rtypes.object
        project_actions : rtypes.object

    standard_tabs : ->
        # TODO: Clean up.

        # Memoize classes
        # I think this pattern works. The classes never have to change (project id's don't change)
        # Alternatives?
        ProjectFiles = @ProjectFiles ? ProjectFilesGenerator(@props.project_store.name)
        @ProjectFiles = ProjectFiles

        ProjectNew = @ProjectNew ? ProjectNewGenerator(@props.project_store.name)
        @ProjectNew = ProjectNew

        ProjectLog = @ProjectLog ? ProjectLogGenerator(@props.project_store.name)
        @ProjectLog = ProjectLog

        ProjectSearch = @ProjectSearch ? ProjectSearchGenerator(@props.project_store.name)
        @ProjectSearch = ProjectSearch

        # compute how user is related to this project once for all, so that
        # it stays constant while opening (e.g., stays admin)
        # Does a user's group change?
        group = @group ? redux.getStore('projects').get_my_group(@props.project_id)
        @group = group
        ProjectSettings = @ProjectSettings ? ProjectSettingsGenerator(@props.project_store.name)
        @ProjectSettings = ProjectSettings

        [   <Tab key={'files'} eventKey={'files'} title={"Files"}>
                <Row>
                    <Col xs=12>
                        <ProjectFiles project_id={@props.project_id} redux={redux} actions={@props.project_actions} />
                    </Col>
                </Row>
            </Tab>,
            <Tab key={'new'} eventKey={'new'} title={"New"}>
                <Row>
                    <Col xs=12>
                        <ProjectNew project_id={@props.project_id} redux={redux} actions={@props.project_actions} />
                    </Col>
                </Row>
            </Tab>,
            <Tab key={'log'} eventKey={'log'} title={"Log"}>
                <Row>
                    <Col xs=12>
                        <ProjectLog redux={redux} actions={@props.project_actions} />
                    </Col>
                </Row>
            </Tab>,
            <Tab key={'find'} eventKey={'find'} title={"Find"}>
                <Row>
                    <Col xs=12>
                        <ProjectSearch redux={redux} actions={@props.project_actions} />
                    </Col>
                </Row>
            </Tab>,
            <Tab key={'settings'} eventKey={'settings'} title={"Settings"}>
                <Row>
                    <Col xs=12>
                        <ProjectSettings project_id={@props.project_id} redux={redux} group={group} />
                    </Col>
                </Row>
            </Tab>
        ]

    select_tab : (key) ->
        @props.project_actions.set_active_tab(key)

    render : ->
        tabs = @standard_tabs()
        <div>
            <Well>
                Debug Stats: {@props.project_id}
            </Well>
            <Tabs activeKey={@props.active_tab} onSelect={@select_tab} animation={false}>
                {tabs}
            </Tabs>
        </div>

exports.ProjectPage = rclass
    displayName : 'Projects-ProjectPage'

    propTypes :
        project_id : rtypes.string.isRequired

    render : ->
        store = redux.getProjectStore(@props.project_id)
        ProjectPage = @ProjectPage ? ProjectPageGenerator(store.name)
        @ProjectPage = ProjectPage

        <Redux redux={redux}>
            <ProjectPage project_id      = {@props.project_id}
                         redux           = {redux}
                         project_store   = {store}
                         project_actions = {redux.getProjectActions(@props.project_id)} />
        </Redux>
