###
project page react component


###

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

{ProjectFiles}    = require('./project_files')
{ProjectNew}      = require('./project_new')
{ProjectLog}      = require('./project_log')
{ProjectSearch}   = require('./project_search')
{ProjectSettings} = require('./project_settings')
project_file = require('./project_file')
{file_associations} = require('./editor')
{ProjectStore} = require('./project_store')
{NavItem, Nav} = require('react-bootstrap')
{Icon, Tip} = require('./r_misc')
misc = require('misc')

ProjectTab = rclass
    displayName : 'ProjectTab'

    propTypes :
        name : rtypes.string
        label : rtypes.string
        icon : rtypes.string
        project_id : rtypes.string
        tooltip : rtypes.string
        active_project_tab : rtypes.string

    render : ->
        <NavItem
            key={@props.name} active={@props.name == @props.active_project_tab}
            onClick={=>@actions(project_id: @props.project_id).set_active_tab(@props.name)}>
            <Tip title={@props.tooltip} placement='bottom' size='small'>
                <Icon name={@props.icon} /> {@props.label}
            </Tip>
        </NavItem>

ProjectPageTemp = rclass ({name}) ->
    displayName : 'ProjectPageTemp'

    reduxProps :
        projects :
            project_map : rtypes.immutable
            get_my_group : rtypes.func
        "#{name}" :
            active_project_tab : rtypes.string
            open_files  : rtypes.immutable
            open_files_order : rtypes.immutable

    propTypes :
        redux           : rtypes.object
        project_id      : rtypes.string
        project_actions : rtypes.object

    file_tabs: ->
        if not @props.open_files_order?
            return
        tabs = []
        @props.open_files_order.map (path) =>
            tabs.push(@file_tab(path))
        return tabs

    file_tab: (path) ->
        console.log("bar", path)
        ext = misc.filename_extension(path)
        icon = file_associations[ext]?.icon ? 'code-o'
        display_name = misc.path_split(path).tail
        <ProjectTab key={path} name={path} label={display_name} icon={icon} tooltip={path} project_id={@props.project_id} active_project_tab={@props.active_project_tab} />

    render_page : ->
        active = @props.active_project_tab
        switch active
            when 'files'
                return <ProjectFiles name={@props.name} project_id={@props.project_id} actions={@props.project_actions} />
            when 'new'
                return <ProjectNew name={@props.name} project_id={@props.project_id} actions={@props.project_actions} />
            when 'log'
                return <ProjectLog actions={@props.project_actions} name={@props.name}/>
            when 'search'
                return <ProjectSearch actions={@props.project_actions} name={@props.name} />
            when 'settings'
                group = @props.get_my_group(@props.project_id)
                return <ProjectSettings project_id={@props.project_id} name={@props.name} group={group} />
            else
                if @props.open_files.has(active)
                    Name = @props.open_files.get(active)
                    return <Name path={active} project_id={@props.project_id} redux={redux} actions={redux.getActions(Name.redux_name)} />
                return <div>You shouldn't be here! {@props.active_project_tab}</div>

    render : ->
        window.pprops = @props
        project_pages =
            files :
                label : 'Files'
                icon : 'folder-open-o'
                tooltip : 'Browse files'
            new :
                label : 'New'
                icon : 'plus-circle'
                tooltip : 'Create new file, folder, worksheet or terminal'
            log:
                label : 'Log'
                icon : 'history'
                tooltip : 'Log of project activity'
            search :
                label : 'Search'
                icon : 'search'
                tooltip : 'Search files in the project'
            settings :
                label : 'Settings'
                icon : 'wrench'
                tooltip : 'Project settings and controls'

        <div>
            <Nav bsStyle="pills" id="project-tabs">
                {[<ProjectTab name={k} label={v.label} icon={v.icon} tooltip={v.tooltip} project_id={@props.project_id} active_project_tab={@props.active_project_tab} /> for k, v of project_pages]}
                {@file_tabs()}
            </Nav>
            {@render_page()}
        </div>

exports.ProjectPage = rclass
    displayName : 'Projects-ProjectPage'

    propTypes :
        project_id : rtypes.string

    render : ->
        project_name = redux.getProjectStore(@props.project_id).name

        <Redux redux={redux}>
            <ProjectPageTemp name            = {project_name}
                             project_id      = {@props.project_id}
                             redux           = {redux}
                             project_actions = {redux.getProjectActions(@props.project_id)} />
        </Redux>
