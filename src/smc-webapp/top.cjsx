{React, ReactDOM, rclass, redux, rtypes, Redux, Actions, Store} = require('./smc-react')

{Alert, Button, ButtonToolbar, ButtonGroup, Input, Row, Col,
    Panel, Popover, Tabs, Tab, Well} = require('react-bootstrap')

{HelpPage} = require('./r_help')

{ProjectsPage} = require('./projects')

{ProjectPage} = require('./project_page')

{AccountPageRedux} = require('./account_page')

{FileUsePage} = require('./file_use')

###
# Page Redux
###

class PageActions extends Actions
    set_active_tab : (key) ->
        @setState(active_top_tab : key)

redux.createActions('page', PageActions)

# Todo: Save entire state to database for #450, saved workspaces
class PageStore extends Store
    todo : ->
        'place holder'

init_store =
    active_top_tab : 'projects' # One of: projects, account, about, [project id]

redux.createStore('page', PageStore, init_store)

###
# JSX
###

Page = rclass
    displayName : "Page"

    reduxProps :
        projects :
            project_state  : rtypes.immutable # Map of open projects and their state
            project_map    : rtypes.immutable # All projects available to the user
        page :
            active_top_tab : rtypes.string    # key of the active tab

    propTypes :
        redux : rtypes.object
        page_actions : rtypes.object

    standard_tabs : ->
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

    project_tabs : ->
        v = []
        @props.project_state.map (val, project_id) =>
            v.push(@project_tab(project_id))
        return v

    project_tab : (project_id) ->
        title = @props.project_map.get?(project_id).get('title')
        <Tab key={project_id} eventKey={project_id} title={title}>
            <ProjectPage project_id={project_id} />
        </Tab>

    select_tab : (key) ->
        @props.page_actions.set_active_tab(key)

    render : ->
        window.props = @props   # TODO: FOR DEBUGGING ONLY
        tabs = @standard_tabs().concat(@project_tabs())
        <div>
            <Tabs activeKey={@props.active_top_tab} onSelect={@select_tab} animation={false}>
                {tabs}
            </Tabs>
       </div>


$('body').css('padding-top':0).append('<div class="page-container smc-react-container"></div>')
page = <Redux redux={redux}>
    <Page redux={redux} page_actions={redux.getActions('page')} />
</Redux>
ReactDOM.render(page, $(".smc-react-container")[0])
