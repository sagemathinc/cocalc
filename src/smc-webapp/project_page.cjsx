###
project page react component


###

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

{Tabs, Tab} = require('react-bootstrap')

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
                <div>New</div>
            </Tab>,
            <Tab key={'log'} eventKey={'log'} title={"Log"}>
                <div>Log</div>
            </Tab>,
            <Tab key={'find'} eventKey={'find'} title={"Find"}>
                <div>Find</div>
            </Tab>,
            <Tab key={'settings'} eventKey={'settings'} title={"Settings"}>
                <div>Settings</div>
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
