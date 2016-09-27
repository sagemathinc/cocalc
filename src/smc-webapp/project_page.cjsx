###
project page react component
###

# 3rd party Libraries
{Nav, NavItem, Alert, Col, Row} = require('react-bootstrap')
{SortableContainer, SortableElement} = require('react-sortable-hoc')

# SMC Libraries
{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{ProjectFiles}    = require('./project_files')
{ProjectNew}      = require('./project_new')
{ProjectLog}      = require('./project_log')
{ProjectSearch}   = require('./project_search')
{ProjectSettings} = require('./project_settings')
project_file = require('./project_file')
{file_associations} = require('./editor')
{ProjectStore} = require('./project_store')
{Icon, Tip, SAGE_LOGO_COLOR} = require('./r_misc')
misc = require('misc')

default_file_tab_styles =
    width : 250
    borderRadius : "5px 5px 0px 0px"
    flexShrink : '1'
    overflow : 'hidden'

ProjectTab = rclass
    displayName : 'ProjectTab'

    propTypes :
        name               : rtypes.string
        label              : rtypes.string    # rendered tab title
        icon               : rtypes.string    # Affiliated icon
        project_id         : rtypes.string
        tooltip            : rtypes.string
        active_project_tab : rtypes.string
        file_tab           : rtypes.bool      # Whether or not this tab holds a file
        shrink             : rtypes.bool      # Whether or not to shrink to just the icon
        open_files_order   : rtypes.object

    getInitialState : () ->
        x_hovered : false

    mouse_over: ->
        @setState(x_hovered:true)

    mouse_out: ->
        @setState(x_hovered:false)
        @actions({project_id:@props.project_id}).clear_ghost_file_tabs()

    close_file : (e, path) ->
        e.stopPropagation()
        e.preventDefault()
        index = @props.open_files_order.indexOf(path)
        size = @props.open_files_order.size
        if misc.path_to_tab(path) == @props.active_project_tab
            next_active_tab = 'files'
            if index == 0 or size <= 1
                next_active_tab = 'files'
            else
                if index == size - 1
                    next_active_tab = misc.path_to_tab(@props.open_files_order.get(index - 1))
                else
                    next_active_tab = misc.path_to_tab(@props.open_files_order.get(index + 1))
            @actions(project_id: @props.project_id).set_active_tab(next_active_tab)
        if index == size - 1
            @actions({project_id:@props.project_id}).clear_ghost_file_tabs()
        else
            @actions({project_id:@props.project_id}).add_a_ghost_file_tab()
        @actions(project_id: @props.project_id).close_file(path)

    render : ->
        styles ={}

        is_active_tab = @props.name == @props.active_project_tab

        if @props.file_tab
            styles = misc.copy(default_file_tab_styles)
            if is_active_tab
                styles.backgroundColor = SAGE_LOGO_COLOR
        else
            styles.flex = 'none'

        label_styles =
            whiteSpace: 'nowrap'
            overflow: 'hidden'
            textOverflow: 'ellipsis'

        x_button_styles =
            float:'right'
            whiteSpace:'nowrap'
            fontSize:'12pt'
            marginTop: '-3px'

        if @state.x_hovered
            x_button_styles.color = 'red'

        text_color = "white" if is_active_tab

        <NavItem
            style={styles}
            active={is_active_tab}
            onClick={=>@actions(project_id: @props.project_id).set_active_tab(@props.name)}
        >
            {# Truncated file name}
            {# http://stackoverflow.com/questions/7046819/how-to-place-two-divs-side-by-side-where-one-sized-to-fit-and-other-takes-up-rem}
            <div style={width:'100%', color:text_color}>
                <div style={x_button_styles}>
                    {<Icon
                        onMouseOver={@mouse_over} onMouseOut={@mouse_out}
                        name = 'times'
                        onClick = {(e)=>@close_file(e, misc.tab_to_path(@props.name))}
                    /> if @props.file_tab}
                </div>
                <div style={label_styles}>
                    <Tip title={@props.tooltip} placement='bottom' size='small'>
                        <Icon style={fontSize: if @props.file_tab then '10pt' else '15pt'} name={@props.icon} /> {@props.label if not @props.shrink}
                    </Tip>
                </div>
            </div>
        </NavItem>

NavWrapper = ({style, children, id, className, bsStyle}) ->
    React.createElement(Nav, {style:style, id:id, className:className, bsStyle:bsStyle}, children)

GhostTab = (props) ->
    <NavItem
        style={default_file_tab_styles}
    />

SortableProjectTab = SortableElement(ProjectTab)
SortableNav = SortableContainer(NavWrapper)

FreeProjectWarning = rclass ({name}) ->
    displayName : 'FreeProjectWarning'

    reduxProps :
        projects :
            get_total_project_quotas : rtypes.func
        "#{name}" :
            free_warning_extra_shown : rtypes.bool
            free_warning_closed : rtypes.bool

    propTypes :
        project_id : rtypes.string

    extra : (host, internet) ->
        {PolicyPricingPageUrl} = require('./customize')
        if not @props.free_warning_extra_shown
            return null
        <div>
            {<span>This project runs on a heavily loaded randomly rebooted free server. Please upgrade your project to run on a members-only server for more reliability and faster code execution.</span> if host}

            {<span>This project does not have external network access, so you cannot use internet resources directly from this project; in particular, you cannot install software from the internet, download from sites like GitHub, or download data from public data portals.</span> if internet}
            <ul>
                <li>Learn about <a href="#{PolicyPricingPageUrl}" target='_blank'>Pricing and Subscriptions</a></li>
                <li>Read the billing <a href="#{PolicyPricingPageUrl}#faq" target='_blank'>Frequently Asked Questions</a></li>
                <li>Visit <a onClick={=>@actions('page').set_active_tab('account');@actions('account').set_active_tab('billing')}>Billing</a> to <em>subscribe</em> to a plan</li>
                <li>Upgrade <em>this</em> project in <a onClick={=>@actions(project_id: @props.project_id).set_active_tab('settings')}>Project Settings</a></li>
            </ul>
        </div>

    render : ->
        window.wprops = @props
        if @props.free_warning_closed
            return null
        quotas = @props.get_total_project_quotas(@props.project_id)
        if not quotas?
            return null
        host = not quotas.member_host
        internet = not quotas.network
        if not host and not internet
            return null
        styles =
            padding : 2
            paddingLeft : 7
            paddingRight : 7
            cursor : 'pointer'
            marginBottom : 0
            fontSize : 12
        dismiss_styles =
            display : 'inline-block'
            float : 'right'
            fontWeight : 700
            top : -5
            fontSize : 18
            color : 'gray'
            position : 'relative'
        <Alert bsStyle='warning' style={styles}>
            <Icon name='exclamation-triangle' /> WARNING: This project runs {<span>on a <b>free server</b></span> if host} {<span>without <b>internet access</b></span> if internet} &mdash;
            <a onClick={=>@actions(project_id: @props.project_id).show_extra_free_warning()}> learn more...</a>
            <a style={dismiss_styles} onClick={@actions(project_id: @props.project_id).close_free_warning}>×</a>
            {@extra(host, internet)}
        </Alert>

fixed_project_pages =
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
        label : 'Find'
        icon : 'search'
        tooltip : 'Search files in the project'
    settings :
        label : 'Settings'
        icon : 'wrench'
        tooltip : 'Project settings and controls'

# Children must define their own padding from navbar and screen borders
ProjectMainContent = ({project_id, project_name, active_tab_name, group, open_files}) ->
    switch active_tab_name
        when 'files'
            return <ProjectFiles name={project_name} project_id={project_id} />
        when 'new'
            return <ProjectNew name={project_name} project_id={project_id} />
        when 'log'
            return <ProjectLog name={project_name} />
        when 'search'
            return <ProjectSearch name={project_name} />
        when 'settings'
            return <ProjectSettings project_id={project_id} name={project_name} group={group} />
        else
            active_path = misc.tab_to_path(active_tab_name)
            if open_files?.has(active_path)
                Editor = open_files.get(active_path)
                # TODO: ideally name, path, project_id is all we pass down here to any editor
                <Editor
                    path={active_path}
                    project_id={project_id}
                    redux={redux}
                    actions={redux.getActions(Editor.redux_name)}
                    name={Editor.redux_name}
                    project_name={project_name}
                    path={active_path}
                />
            else
                <div>You should not be here! {active_tab_name}</div>

exports.ProjectPage = ProjectPage = rclass ({name}) ->
    displayName : 'ProjectPage'

    reduxProps :
        projects :
            project_map  : rtypes.immutable
            get_my_group : rtypes.func
        page :
            fullscreen : rtypes.bool
        "#{name}" :
            active_project_tab  : rtypes.string
            open_files          : rtypes.immutable
            open_files_order    : rtypes.immutable
            free_warning_closed : rtypes.bool     # Makes bottom height update
            num_ghost_file_tabs : rtypes.number

    propTypes :
        project_id : rtypes.string

    componentDidMount : ->
        @set_bottom_height()

    componentDidUpdate : ->
        @set_bottom_height()

    set_bottom_height : ->
        node = ReactDOM.findDOMNode(@refs.projectNav)
        if node?
            @actions(project_id : @props.project_id).set_editor_top_position(node.offsetTop + node.offsetHeight)
        else
            @actions(project_id : @props.project_id).set_editor_top_position(0)

    on_sort_end : ({oldIndex, newIndex}) ->
        console.log("PROJECT FILE SORT ENDED WITH", oldIndex, newIndex)
        @actions(name).move_file_tab({old_index:oldIndex, new_index:newIndex, open_files_order:@props.open_files_order})

    file_tabs: ->
        if not @props.open_files_order?
            return
        tabs = []
        @props.open_files_order.map (path, index) =>
            tabs.push(@file_tab(path, index))
        if @props.num_ghost_file_tabs == 0
            return tabs

        num_real_tabs = @props.open_files_order.size
        num_tabs = num_real_tabs + @props.num_ghost_file_tabs
        for index in [num_real_tabs..(num_tabs-1)]
            tabs.push(<GhostTab index={index} key={index}/>)
        return tabs

    file_tab: (path, index) ->
        ext = misc.filename_extension(path)
        icon = file_associations[ext]?.icon ? 'code-o'
        display_name = misc.trunc(misc.path_split(path).tail, 64)
        <SortableProjectTab
            index={index}
            key={path}
            name={misc.path_to_tab(path)}
            label={display_name}
            icon={icon}
            tooltip={path}
            project_id={@props.project_id}
            file_tab={true}
            active_project_tab={@props.active_project_tab}
            open_files_order={@props.open_files_order}
        />

    render : ->
        page_styles ='
            #smc-file-tabs-fixed>li>a {
                padding: 8px 10px;
            }
            #smc-file-tabs-files>li>a {
                padding: 13px 15px 7px;
            }
            .smc-file-tab-floating {
                background-color: rgb(237, 237, 237);
                border-bottom-left-radius:0px;
                border-bottom-right-radius:0px;
                border-top-left-radius:5px;
                border-top-right-radius:5px;
                box-sizing:border-box;
                color:rgb(51, 51, 51);
                display:block;
                flex-shrink:1;
                height:36.8px;
                line-height:normal;
                list-style-image:none;
                list-style-position:outside;
                list-style-type:none;
                overflow-x:hidden;
                overflow-y:hidden;
                position:relative;
                text-align:left;
                width:250px;
            }
            .smc-file-tab-floating>a {
                background-color:rgba(0, 0, 0, 0);
                border-bottom-left-radius:4px;
                border-bottom-right-radius:4px;
                border-top-left-radius:4px;
                border-top-right-radius:4px;
                box-sizing:border-box;
                display:block;
                height:36.8px;
                line-height:normal;
                list-style-image:none;
                list-style-position:outside;
                list-style-type:none;
                padding: 13px 15px 7px;
                position:relative;
            }'
        shrink_fixed_tabs = $(window).width() < 376 + (@props.open_files_order.size + @props.num_ghost_file_tabs) * 250

        <div className='container-content'>
            <style>{page_styles}</style>
            <FreeProjectWarning project_id={@props.project_id} name={name} />
            {<div id="smc-file-tabs" ref="projectNav" style={width:"100%", height:"37px"}>
                <Nav bsStyle="pills" id="smc-file-tabs-fixed" style={float:'left'}>
                    {[<ProjectTab
                        name={k}
                        label={v.label}
                        icon={v.icon}
                        tooltip={v.tooltip}
                        project_id={@props.project_id}
                        active_project_tab={@props.active_project_tab}
                        shrink={shrink_fixed_tabs}
                    /> for k, v of fixed_project_pages]}
                </Nav>
                <SortableNav
                    helperClass={'smc-file-tab-floating'}
                    onSortEnd={@on_sort_end}
                    axis={'x'}
                    lockAxis={'x'}
                    lockToContainerEdges
                    distance={3}
                    bsStyle="pills" id="smc-file-tabs-files" style={display:'flex'}
                >
                    {@file_tabs()}
                </SortableNav>
            </div> if not @props.fullscreen}
            <ProjectMainContent
                project_id={@props.project_id}
                project_name={@props.name}
                active_tab_name={@props.active_project_tab}
                group={@props.get_my_group(@props.project_id)}
                open_files={@props.open_files}
            />
        </div>

exports.MobileProjectPage = MobileProjectPage = rclass ({name}) ->
    displayName : 'MoblileProjectPage'

    reduxProps :
        projects :
            project_map  : rtypes.immutable
            get_my_group : rtypes.func
        page :
            fullscreen : rtypes.bool
        "#{name}" :
            active_project_tab  : rtypes.string
            open_files          : rtypes.immutable
            open_files_order    : rtypes.immutable
            free_warning_closed : rtypes.bool     # Makes bottom height update
            num_ghost_file_tabs : rtypes.number

    propTypes :
        project_id : rtypes.string

    componentDidMount : ->
        @set_bottom_height()

    componentDidUpdate : ->
        @set_bottom_height()

    set_bottom_height : ->
        node = ReactDOM.findDOMNode(@refs.projectNav)
        if node?
            @actions(project_id : @props.project_id).set_editor_top_position(node.offsetTop + node.offsetHeight)
        else
            @actions(project_id : @props.project_id).set_editor_top_position(0)

    on_sort_end : ({oldIndex, newIndex}) ->
        console.log("PROJECT FILE SORT ENDED WITH", oldIndex, newIndex)
        @actions(name).move_file_tab({old_index:oldIndex, new_index:newIndex, open_files_order:@props.open_files_order})

    file_tabs: ->
        if not @props.open_files_order?
            return
        tabs = []
        @props.open_files_order.map (path, index) =>
            tabs.push(@file_tab(path, index))
        return tabs

    file_tab: (path, index) ->
        ext = misc.filename_extension(path)
        icon = file_associations[ext]?.icon ? 'code-o'
        display_name = misc.trunc(misc.path_split(path).tail, 64)
        <SortableProjectTab
            index={index}
            key={path}
            name={misc.path_to_tab(path)}
            label={display_name}
            icon={icon}
            tooltip={path}
            project_id={@props.project_id}
            file_tab={true}
            active_project_tab={@props.active_project_tab}
            open_files_order={@props.open_files_order}
        />

    render : ->
        page_styles ='
            #smc-file-tabs-fixed>li>a {
                padding: 8px 10px;
            }
            #smc-file-tabs-files>li>a {
                padding: 13px 15px 7px;
            }'

        <div className='container-content'>
            <style>{page_styles}</style>
            <FreeProjectWarning project_id={@props.project_id} name={name} />
            {<div id="smc-file-tabs" ref="projectNav" style={width:"100%", height:"37px"}>
                <Nav bsStyle="pills" id="smc-file-tabs-fixed" style={float:'left'}>
                    {[<ProjectTab
                        name={k}
                        label={v.label}
                        icon={v.icon}
                        tooltip={v.tooltip}
                        project_id={@props.project_id}
                        active_project_tab={@props.active_project_tab}
                        shrink={true}
                    /> for k, v of fixed_project_pages]}
                </Nav>
                <Nav bsStyle="pills" id="smc-file-tabs-files" style={display:'flex'}
                >
                    {@file_tabs()}
                </Nav>
            </div> if not @props.fullscreen}
            <ProjectMainContent
                project_id={@props.project_id}
                project_name={@props.name}
                active_tab_name={@props.active_project_tab}
                group={@props.get_my_group(@props.project_id)}
                open_files={@props.open_files}
            />
        </div>
