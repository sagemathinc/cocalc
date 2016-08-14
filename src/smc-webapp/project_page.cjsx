###
project page react component


###

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

{Tabs, Tab} = require('react-bootstrap')

project_log      = require('project_log')
project_new      = require('project_new')
project_search   = require('project_search')
project_settings = require('project_settings')

FilePage = rclass
    render : ->
        <div>File Page</div>

ProjectPage = rclass

    reduxProps :
        projects :
            project_map : rtypes.immutable

    propTypes :
        redux      : rtypes.object
        project_id : rtypes.string.isRequired


    standard_tabs: ->
        [   <Tab key={'files'} eventKey={'projects'} title={"Files"}>
                <div>Files</div>
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
        # TODO
        #@props.project_state.map (val, project_id) =>
        #    v.push(@project_tab(project_id))
        return v

    file_tab: (path) ->
        <Tab key={path} eventKey={path} title={path}>
            <FilePage path={path} />
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
        <Redux redux={redux}>
            <ProjectPage redux={redux} project_id={@props.project_id} />
        </Redux>
