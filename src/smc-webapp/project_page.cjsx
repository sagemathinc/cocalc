###
project page react component


###

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

{ProjectFiles}   = require('project_files')
{ProjectNew, FileUpload}      = require('project_new')
{ProjectLog}      = require('project_log')
{ProjectSearch}   = require('project_search')
{ProjectSettings} = require('project_settings')
project_file = require('project_file')

{ProjectStore} = require('./project_store')

{Tabs, Tab} = require('react-bootstrap')

FilePage = rclass
    render : ->
        <div>File Page</div>

ProjectPageTemp = rclass ({name}) ->

    reduxProps :
        projects :
            project_map : rtypes.immutable
        "#{name}" :
            active_tab : rtypes.string
            open_files  : rtypes.immutable

    propTypes :
        redux           : rtypes.object
        project_id      : rtypes.string.isRequired
        project_actions : rtypes.object

    standard_tabs : ->
        # compute how user is related to this project once for all, so that
        # it stays constant while opening (e.g., stays admin)
        # Does a user's group change? Problem if it does.
        group = @group ? redux.getStore('projects').get_my_group(@props.project_id)
        @group = group

        [   <Tab key={'files'} eventKey={'files'} title={"Files"}>
                <ProjectFiles name={@props.project_store.name} project_id={@props.project_id} actions={@props.project_actions} redux={redux} />
            </Tab>,
            <Tab key={'new'} eventKey={'new'} title={"New"}>
                <ProjectNew name={@props.project_store.name} project_id={@props.project_id} actions={@props.project_actions} />
            </Tab>,
            <Tab key={'log'} eventKey={'log'} title={"Log"}>
                <ProjectLog redux={redux} actions={@props.project_actions} name={@props.project_store.name}/>
            </Tab>,
            <Tab key={'find'} eventKey={'find'} title={"Find"}>
                <ProjectSearch redux={redux} actions={@props.project_actions} name={@props.project_store.name} />
            </Tab>,
            <Tab key={'settings'} eventKey={'settings'} title={"Settings"}>
                <ProjectSettings project_id={@props.project_id} name={@props.project_store.name} redux={redux} group={group} />
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
        Name = editor # I'm not going to bother figuring out why this is necessary
        <Tab key={path} eventKey={path} title={path}>
            <Name path={path} project_id={@props.project_id} redux={redux} actions={redux.getActions(editor.redux_name)} />
        </Tab>

    render : ->
        tabs = @standard_tabs()
        @file_tabs(tabs)
        <div>
            <Tabs activeKey={@props.active_tab} onSelect={@select_tab} animation={false} id="project-tabs">
                {tabs}
            </Tabs>
        </div>

exports.ProjectPage = rclass
    displayName : 'Projects-ProjectPage'

    propTypes :
        project_id : rtypes.string.isRequired

    render : ->
        project_name = redux.getProjectStore(@props.project_id).name

        <Redux redux={redux}>
            <ProjectPageTemp name            = {project_name}
                             project_id      = {@props.project_id}
                             redux           = {redux}
                             project_actions = {redux.getProjectActions(@props.project_id)} />
        </Redux>
