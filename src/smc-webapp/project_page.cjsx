###
project page react component


###

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

{Tabs, Tab} = require('react-bootstrap')

project_files    = require('project_files')
project_new      = require('project_new')
project_log      = require('project_log')
project_search   = require('project_search')
project_settings = require('project_settings')
project_file     = require('project_file')

FilePage = rclass
    render : ->
        <div>File Page</div>

ProjectPage = (name) -> rclass

    reduxProps :
        projects :
            project_map : rtypes.immutable
        "#{name}" :
            open_files  : rtypes.immutable

    propTypes :
        redux      : rtypes.object
        project_id : rtypes.string.isRequired


    standard_tabs: ->
        [   <Tab key={'files'} eventKey={'files'} title={"Files"}>
                {project_files.render(@props.project_id, @props.redux)}
            </Tab>,
            <Tab key={'new'} eventKey={'new'} title={"New"}>
                {project_new.render(@props.project_id, @props.redux)}
            </Tab>,
            <Tab key={'log'} eventKey={'log'} title={"Log"}>
                {project_log.render(@props.project_id, @props.redux)}
            </Tab>,
            <Tab key={'find'} eventKey={'find'} title={"Find"}>
                {project_search.render(@props.project_id, @props.redux)}
            </Tab>,
            <Tab key={'settings'} eventKey={'settings'} title={"Settings"}>
                {project_settings.render(@props.project_id, @props.redux)}
            </Tab>
        ]

    file_tabs: (v) ->
        if not @props.open_files?
            return
        @props.open_files.map (path) =>
            v.push(@file_tab(path))

    file_tab: (path) ->
        <Tab key={path} eventKey={path} title={path}>
            {project_file.render(@props.project_id, path, @props.redux)}
        </Tab>

    render : ->
        tabs = @standard_tabs()
        @file_tabs(tabs)
        <div>
            <Tabs animation={false}>
                {tabs}
            </Tabs>
       </div>

exports.ProjectPage = rclass
    displayName : 'Projects-ProjectPage'

    propTypes :
        project_id : rtypes.string.isRequired

    render : ->
        store = redux.getProjectStore(@props.project_id)
        if ((store.get_directory_listings()?.size) ? 0) == 0  # TODO: probably bad -- will go away when move to backend and push/sync; causes activity to get displayed before component is mounted which is a warning.
            redux.getProjectActions(@props.project_id).set_directory_files()
        C = ProjectPage(store.name)
        <Redux redux={redux}>
            <C redux={redux} project_id={@props.project_id} />
        </Redux>
