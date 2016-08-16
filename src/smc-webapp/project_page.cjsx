###
project page react component


###

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

{ProjectFilesGenerator}    = require('project_files')
{ProjectNewGenerator}      = require('project_new')
{ProjectLogGenerator}      = require('project_log')
{ProjectSearchGenerator}   = require('project_search')
{ProjectSettingsGenerator} = require('project_settings')
project_file = require('project_file')

{ProjectStore} = require('./project_store')

{Tabs, Tab} = require('react-bootstrap')

FilePage = rclass
    render : ->
        <div>File Page</div>

ProjectPageGenerator = (name) -> console.log("Generating Project page class!"); rclass

    reduxProps :
        projects :
            project_map : rtypes.immutable
        "#{name}" :
            active_tab : rtypes.string
            open_files  : rtypes.immutable

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
        # Generating the tabs is a little expensive. But at least the time doesn't get super nasty
        # Could be more lazily loaded
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
        # Does a user's group change? Problem if it does.
        group = @group ? redux.getStore('projects').get_my_group(@props.project_id)
        @group = group
        ProjectSettings = @ProjectSettings ? ProjectSettingsGenerator(@props.project_store.name)
        @ProjectSettings = ProjectSettings

        [   <Tab key={'files'} eventKey={'files'} title={"Files"}>
                <ProjectFiles project_id={@props.project_id} redux={redux} actions={@props.project_actions} />
            </Tab>,
            <Tab key={'new'} eventKey={'new'} title={"New"}>
                <ProjectNew project_id={@props.project_id} redux={redux} actions={@props.project_actions} />
            </Tab>,
            <Tab key={'log'} eventKey={'log'} title={"Log"}>
                <ProjectLog redux={redux} actions={@props.project_actions} />
            </Tab>,
            <Tab key={'find'} eventKey={'find'} title={"Find"}>
                <ProjectSearch redux={redux} actions={@props.project_actions} />
            </Tab>,
            <Tab key={'settings'} eventKey={'settings'} title={"Settings"}>
                <ProjectSettings project_id={@props.project_id} redux={redux} group={group} />
            </Tab>
        ]

    select_tab : (key) ->
        @props.project_actions.set_active_tab(key)

    file_tabs: (v) ->
        if not @props.open_files?
            return
        @props.open_files.map (editor, path) =>
            v.push(@file_tab(editor, path))

    file_tab: (editor, path) ->
        # TODO: Stuff passed to every editor should be standarized
        # Alternatively, this needs be generalized
        Name = editor
        <Tab key={path} eventKey={path} title={path}>
            <Name path={path} project_id={@props.project_id} redux={redux} actions={redux.getActions(editor.redux_name)} />
        </Tab>

    render : ->
        tabs = @standard_tabs()
        @file_tabs(tabs)
        <div>
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
