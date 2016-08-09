{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

{Alert, Button, ButtonToolbar, ButtonGroup, Input, Row, Col,
    Panel, Popover, Tabs, Tab, Well} = require('react-bootstrap')

{HelpPage} = require('./r_help')

{ProjectsPage} = require('./projects')

{ProjectPage} = require('./project_page')

{AccountPageRedux} = require('./account_page')

{FileUsePage} = require('./file_use')

Page = rclass
    displayName : "Page"

    reduxProps :
        projects :
            project_state : rtypes.immutable
            project_map   : rtypes.immutable

    propTypes :
        redux : rtypes.object

    standard_tabs: ->
        [   <Tab key={'projects'} eventKey={'projects'} title={"Projects"}>
                <ProjectsPage />
            </Tab>,
            <Tab key={'activity'} eventKey={'activity'} title={"Activity"}>
                <FileUsePage />
            </Tab>,
            <Tab key={'account'} eventKey={'account'} title={"Account"}>
                <AccountPageRedux />
            </Tab>,
            <Tab key={'about'} eventKey={'about'} title={"About"}>
                <HelpPage />
            </Tab>,
            <Tab key={'network'} eventKey={'network'} title={"Network"}>
            </Tab>
        ]

    project_tabs: (v) ->
        @props.project_state.map (val, project_id) =>
            v.push(@project_tab(project_id))
        return v

    project_tab: (project_id) ->
        title = @props.project_map.get(project_id).get('title')
        <Tab key={project_id} eventKey={project_id} title={title}>
            <ProjectPage project_id={project_id} />
        </Tab>

    render : ->
        window.props = @props   # TODO: FOR DEBUGGING ONLY
        tabs = @standard_tabs()
        @project_tabs(tabs)
        <div>
            <Tabs animation={false}>
                {tabs}
            </Tabs>
       </div>


$('body').css('padding-top':0).append('<div class="page-container smc-react-container"></div>')
page = <Redux redux={redux}>
    <Page  redux={redux} />
</Redux>
ReactDOM.render(page, $(".smc-react-container")[0])
