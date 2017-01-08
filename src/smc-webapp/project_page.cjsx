###
project page react component
###
{IS_MOBILE} = require('./feature')

# 3rd party Libraries
{Button, Nav, NavItem, NavDropdown, MenuItem, Alert, Col, Row} = require('react-bootstrap')
{SortableContainer, SortableElement} = require('react-sortable-hoc')

Draggable = require('react-draggable')

# SMC Libraries
{SideChat}        = require('./side_chat')
{ProjectFiles}    = require('./project_files')
{ProjectNew}      = require('./project_new')
{ProjectLog}      = require('./project_log')
{ProjectSearch}   = require('./project_search')
{ProjectSettings} = require('./project_settings')
{ProjectStore}    = require('./project_store')

project_file = require('./project_file')
{file_associations} = require('./editor')

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{Icon, Tip, SAGE_LOGO_COLOR, Loading, Space} = require('./r_misc')

{ChatIndicator} = require('./chat-indicator')

misc = require('misc')
misc_page = require('./misc_page')

DEFAULT_CHAT_WIDTH = 0.3

DEFAULT_FILE_TAB_STYLES =
    width        : 250
    borderRadius : "5px 5px 0px 0px"
    flexShrink   : '1'
    overflow     : 'hidden'

CHAT_INDICATOR_STYLE =
    paddingTop  : '5px'
    overflow    : 'hidden'
    paddingLeft : '5px'
    borderLeft  : '1px solid lightgrey'

FileTab = rclass
    displayName : 'FileTab'

    propTypes :
        name         : rtypes.string
        label        : rtypes.string    # rendered tab title
        icon         : rtypes.string    # Affiliated icon
        project_id   : rtypes.string
        tooltip      : rtypes.string
        is_active    : rtypes.bool
        file_tab     : rtypes.bool      # Whether or not this tab holds a file
        shrink       : rtypes.bool      # Whether or not to shrink to just the icon
        has_activity : rtypes.bool      # Whether or not some activity is happening with the file

    getInitialState : () ->
        x_hovered : false

    componentDidMount : ->
        @strip_href()

    componentDidUpdate : ->
        @strip_href()

    strip_href : ->
        ReactDOM.findDOMNode(@refs.tab)?.children[0].removeAttribute('href')

    mouse_over_x: ->
        @setState(x_hovered:true)

    mouse_out_x: ->
        @setState(x_hovered:false)
        @actions({project_id:@props.project_id}).clear_ghost_file_tabs()

    close_file : (e, path) ->
        e.stopPropagation()
        e.preventDefault()
        @actions(project_id:@props.project_id).close_tab(path)

    render : ->
        styles = {}

        if @props.file_tab
            styles = misc.copy(DEFAULT_FILE_TAB_STYLES)
            if @props.is_active
                styles.backgroundColor = SAGE_LOGO_COLOR
        else
            styles.flex = 'none'

        icon_style =
            fontSize: '15pt'

        if @props.file_tab
            icon_style.fontSize = '10pt'

        if @props.has_activity
            icon_style.color = 'orange'

        label_styles =
            whiteSpace   : 'nowrap'
            overflow     : 'hidden'
            textOverflow : 'ellipsis'

        x_button_styles =
            float      : 'right'
            whiteSpace : 'nowrap'
            fontSize   : '12pt'
            marginTop  : '-3px'

        if @state.x_hovered
            x_button_styles.color = 'red'

        text_color = "white" if @props.is_active

        <NavItem
            ref     = 'tab'
            style   = {styles}
            active  = {@props.is_active}
            onClick = {=>@actions(project_id: @props.project_id).set_active_tab(@props.name)}
        >
            <div style={width:'100%', color:text_color, cursor : 'pointer'}>
                <div style={x_button_styles}>
                    {<Icon
                        onMouseOver = {@mouse_over_x} onMouseOut={@mouse_out_x}
                        name        = 'times'
                        onClick     = {(e)=>@close_file(e, misc.tab_to_path(@props.name))}
                    /> if @props.file_tab}
                </div>
                <div style={label_styles}>
                    <Tip title={@props.tooltip} placement='bottom' size='small'>
                        <Icon style={icon_style} name={@props.icon} /> {@props.label if not @props.shrink}
                    </Tip>
                </div>
            </div>
        </NavItem>

NavWrapper = ({style, children, id, className, bsStyle}) ->
    React.createElement(Nav, {style:style, id:id, className:className, bsStyle:bsStyle}, children)

GhostTab = (props) ->
    <NavItem
        style={DEFAULT_FILE_TAB_STYLES}
    />

SortableFileTab = SortableElement(FileTab)
SortableNav = SortableContainer(NavWrapper)

ProjectWarning = rclass ({name}) ->
    displayName : 'ProjectWarning'

    reduxProps :
        projects :
            # get_total_project_quotas relys on this data
            # Will be removed by #1084
            project_map              : rtypes.immutable.Map
            get_total_project_quotas : rtypes.func
        "#{name}" :
            free_warning_extra_shown : rtypes.bool
            free_warning_closed      : rtypes.bool
        projects :
            get_total_project_quotas : rtypes.func

    propTypes :
        project_id : rtypes.string
        project    : rtypes.object

    extra : (host, internet) ->
        {PolicyPricingPageUrl} = require('./customize')
        if not @props.free_warning_extra_shown
            return null
        <div>
            {<span>This project runs on a heavily loaded randomly rebooted free server that may be unavailable during peak hours. Please upgrade your project to run on a members-only server for more reliability and faster code execution.</span> if host} 

            {<span>This project does not have external network access, so you cannot use internet resources directly from this project; in particular, you cannot install software from the internet, download from sites like GitHub, or download data from public data portals.</span> if internet}
            <ul>
                <li>Learn about <a href="#{PolicyPricingPageUrl}" target='_blank'>Pricing and Subscriptions</a></li>
                <li>Read the billing <a href="#{PolicyPricingPageUrl}#faq" target='_blank'>Frequently Asked Questions</a></li>
                <li>Visit <a onClick={=>@actions('page').set_active_tab('account');@actions('account').set_active_tab('billing')}>Billing</a> to <em>subscribe</em> to a plan</li>
                <li>Upgrade <em>this</em> project in <a onClick={=>@actions(project_id: @props.project_id).set_active_tab('settings')}>Project Settings</a></li>
            </ul>
        </div>

    render_learn_more : ->
        <a onClick={=>@actions(project_id: @props.project_id).show_extra_free_warning()}> learn more...</a>

    get_quota_alerts : ->
        status       = @props.project?.status
        total_quotas = @props.get_total_project_quotas(@props.project_id)
        memory_used     = '?'
        disk_used       = '?'
        if status?
            rss = status.memory?.rss
            if rss
                memory_used = Math.round(rss/1000)
            disk_used = status.disk_MB
            if disk_used
                disk_used = Math.ceil(disk)
        if memory_used
            memory_over_quota = (total_quotas['memory'] - memory_used) < 0
            memory_near_quota = (total_quotas['memory'] - memory_used) >= 0 and (total_quotas['memory'] - memory) < 100
        else
            memory_over_quota = false
            memory_near_quota = false
        if disk_used
            disk_over_quota = (total_quotas['disk_quota'] - disk_used) < 0
            disk_near_quota = (total_quotas['disk_quota'] - disk_used) >= 0 and (total_quotas['disk_quota'] - disk) < 100
        else
            disk_over_quota = false
            disk_near_quota = false
        return [memory_over_quota, memory_near_quota, disk_over_quota, disk_near_quota]

    render : ->
        if not @props.project
            return null
        if not require('./customize').commercial
            return null
        if @props.free_warning_closed
            return null
        quotas = @props.get_total_project_quotas(@props.project_id)
        if not quotas?
            return null
        host = not quotas.member_host
        internet = not quotas.network
        [memory_over_quota, memory_near_quota, disk_over_quota, disk_near_quota] = @get_quota_alerts()
        if not memory_over_quota and not memory_near_quota and not disk_over_quota and not disk_near_quota and not host and not internet
            return null
        styles =
            padding      : 2
            paddingLeft  : 7
            paddingRight : 7
            cursor       : 'pointer'
            marginBottom : 0
            fontSize     : 12
        dismiss_styles =
            display    : 'inline-block'
            float      : 'right'
            fontWeight : 700
            top        : -5
            fontSize   : 18
            color      : 'grey'
            position   : 'relative'
            height     : 0
        <Alert bsStyle='warning' style={styles}>
            <Icon name='exclamation-triangle' /> WARNING: {<span>This project is over its memory quota. Either add more memory through upgrades or kill processes.</span> if memory_over_quota} {<span>This project is near its memory quota. Either add more memory through upgrades or kill processes.</span> if memory_near_quota} {<span>This project is over its disk space quota. Either add more disk space through upgrades or delete files.</span> if disk_over_quota} {<span>This project is near its disk space quota. Either add more disk space through upgrades or delete files.</span> if disk_near_quota} {<span>This project runs</span> if host or internet} {<span>on a <b>free server (which may be unavailable during peak hours)</b></span> if host} {<span>without <b>internet access</b></span> if internet} &mdash;
            {@render_learn_more() if host or internet}
            <a style={dismiss_styles} onClick={@actions(project_id: @props.project_id).close_free_warning}>×</a>
            {@extra(host, internet)}
        </Alert>

# is_public below -- only show this tab if this is true

fixed_project_pages =
    files :
        label     : 'Files'
        icon      : 'folder-open-o'
        tooltip   : 'Browse files'
        is_public : true
    new :
        label     : 'New'
        icon      : 'plus-circle'
        tooltip   : 'Create new file, folder, worksheet or terminal'
        is_public : false
    log:
        label     : 'Log'
        icon      : 'history'
        tooltip   : 'Log of project activity'
        is_public : false
    search :
        label     : 'Find'
        icon      : 'search'
        tooltip   : 'Search files in the project'
        is_public : false
    settings :
        label     : 'Settings'
        icon      : 'wrench'
        tooltip   : 'Project settings and controls'
        is_public : false

# Children must define their own padding from navbar and screen borders
ProjectMainContent = rclass
    propTypes :
        project_id      : rtypes.string.isRequired
        project_name    : rtypes.string.isRequired
        open_files      : rtypes.object
        active_tab_name : rtypes.string
        group           : rtypes.string

    render_editor: (path) ->
        {Editor, redux_name} = @props.open_files.getIn([path, 'component']) ? {}
        if redux_name?
            editor_actions = redux.getActions(redux_name)
        if not Editor?
            <Loading />
        else
            <div style={height:'100%', display:'flex', flexDirection:'column', overflowX:'hidden'}>
                <Editor
                    name         = {redux_name}
                    path         = {path}
                    project_id   = {@props.project_id}
                    redux        = {redux}
                    actions      = {editor_actions}
                    project_name = {@props.project_name}
                />
            </div>

    render_side_chat: (path) ->
        <SideChat
            path       = {misc.meta_file(path, 'chat')}
            redux      = {redux}
            project_id = {@props.project_id}
            />

    render_drag_bar: (path) ->
        reset = () =>
            if not @refs.draggable?
                return
            # This is ugly and dangerous, but I don't know any other way to reset
            # the state of the bar, so it fits back into our flex display model, besides
            # writing something like the Draggable component from scratch for our purposes.
            # For now, this will do.
            @refs.draggable.state.x = 0
            $(ReactDOM.findDOMNode(@refs.draggable)).css('transform','')

        handle_drag_bar_stop = (data) =>
            misc_page.drag_stop_iframe_enable()
            # TODO: rewrite to not use jQuery?
            elt = $(ReactDOM.findDOMNode(@refs.editor_container))
            width = 1 - (data.clientX - elt.offset().left) / elt.width()
            reset()
            redux.getProjectActions(@props.project_id).set_chat_width({path:path, width:width})

        handle_drag_bar_drag = (data) =>
            elt = $(ReactDOM.findDOMNode(@refs.editor_container))
            width = 1 - (data.clientX - elt.offset().left) / elt.width()
            $(ReactDOM.findDOMNode(@refs.side_chat_container)).css('flex-basis', "#{width*100}%")
            reset(); setTimeout(reset, 0)

        <Draggable
            ref    = 'draggable'
            axis   = "x"
            onStop = {handle_drag_bar_stop}
            onDrag = {handle_drag_bar_drag}
            onStart = {misc_page.drag_start_iframe_disable}
            >
            <div className="smc-vertical-drag-bar"> </div>
        </Draggable>

    render_editor_tab: ->
        path         = misc.tab_to_path(@props.active_tab_name)
        if IS_MOBILE
            # Side chat is not supported at all on mobile.
            is_chat_open = false
        else
            chat_width   = @props.open_files.getIn([path, 'chat_width']) ? DEFAULT_CHAT_WIDTH
            is_chat_open = @props.open_files.getIn([path, 'is_chat_open'])

        editor  = @render_editor(path)

        # WARNING: every CSS style below is hard won.  Don't f!$k with them without knowing what
        # you are doing and testing on all supported browser.  - wstein
        if is_chat_open
            # 2 column layout with chat
            content =\
                <div
                    style = {position: 'absolute', height:'100%', width:'100%', display:'flex'}
                    ref   = 'editor_container'
                    >
                    <div style={flex:1, border:'1px solid lightgrey', borderRadius:'4px', overflow:'hidden', height:'100%', width:'100%'}>
                        {editor}
                    </div>
                    {@render_drag_bar(path)}
                    <div
                        ref = 'side_chat_container'
                        style={flexBasis:"#{chat_width*100}%", border:'1px solid grey', borderRadius:'4px', position:'relative'}>
                        {@render_side_chat(path)}
                    </div>
                </div>
        else
            # just the editor
            content =\
                <div style={position: 'absolute', height:'100%', width:'100%', border:'1px solid lightgrey', borderRadius:'4px'}>
                    {editor}
                </div>
        # Finally render it
        <div style={position:'relative', height:0, flex:1}>
            {content}
        </div>

    render : ->
        switch @props.active_tab_name
            when 'files'
                <ProjectFiles name={@props.project_name} project_id={@props.project_id} />
            when 'new'
                <ProjectNew name={@props.project_name} project_id={@props.project_id} />
            when 'log'
                <ProjectLog name={@props.project_name} project_id={@props.project_id} />
            when 'search'
                <ProjectSearch name={@props.project_name} />
            when 'settings'
                <ProjectSettings project_id={@props.project_id} name={@props.project_name} group={@props.group} />
            else
                if not @props.open_files? or not @props.active_tab_name?
                    <Loading />
                else
                    @render_editor_tab()


exports.ProjectPage = ProjectPage = rclass ({name}) ->
    displayName : 'ProjectPage'

    reduxProps :
        projects :
            project_map  : rtypes.object
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

    on_sort_end : ({oldIndex, newIndex}) ->
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
        ext = misc.filename_extension(path).toLowerCase()
        icon = file_associations[ext]?.icon ? 'code-o'
        display_name = misc.trunc(misc.path_split(path).tail, 64)
        <SortableFileTab
            index        = {index}
            key          = {path}
            name         = {misc.path_to_tab(path)}
            label        = {display_name}
            icon         = {icon}
            tooltip      = {path}
            project_id   = {@props.project_id}
            file_tab     = {true}
            has_activity = {@props.open_files.getIn([path, 'has_activity'])}
            is_active    = {@props.active_project_tab == misc.path_to_tab(path)}
        />

    render_chat_indicator: ->
        if @props.active_project_tab?.slice(0,7) != 'editor-'
            # TODO: This is the case where we would support project-wide side chat, or side chats
            # for each individual Files/Search, etc. page (not clear!)
            return
        path = misc.tab_to_path(@props.active_project_tab)
        is_chat_open = @props.open_files.getIn([path, 'is_chat_open'])
        <div style = {CHAT_INDICATOR_STYLE}>
            <ChatIndicator
                project_id   = {@props.project_id}
                path         = {path}
                is_chat_open = {is_chat_open}
            />
        </div>

    render_file_tabs: (is_public) ->
        shrink_fixed_tabs = $(window).width() < (376 + (@props.open_files_order.size + @props.num_ghost_file_tabs) * 250)

        <div className="smc-file-tabs" ref="projectNav" style={width:'100%'}>
            <div style={display:'flex'}>
                <Nav
                    bsStyle   = "pills"
                    className = "smc-file-tabs-fixed-desktop"
                    style     = {overflow:'hidden', float:'left'} >
                    {[<FileTab
                        name       = {k}
                        label      = {v.label}
                        icon       = {v.icon}
                        tooltip    = {v.tooltip}
                        project_id = {@props.project_id}
                        is_active  = {@props.active_project_tab == k}
                        shrink     = {shrink_fixed_tabs}
                    /> for k, v of fixed_project_pages when ((is_public and v.is_public) or (not is_public))]}
                </Nav>
                <SortableNav
                    className            = "smc-file-tabs-files-desktop"
                    helperClass          = {'smc-file-tab-floating'}
                    onSortEnd            = {@on_sort_end}
                    axis                 = {'x'}
                    lockAxis             = {'x'}
                    lockToContainerEdges = {true}
                    distance             = {3 if not IS_MOBILE}
                    bsStyle              = "pills"
                    style                = {display:'flex', overflow:'hidden', flex: 1}
                >
                    {@file_tabs()}
                </SortableNav>
                {@render_chat_indicator() if not is_public}
            </div>
        </div>

    render : ->
        if not @props.open_files_order?
            return <Loading />

        group     = @props.get_my_group(@props.project_id)

        <div className='container-content' style={display: 'flex', flexDirection: 'column', flex: 1}>
            <ProjectWarning project_id={@props.project_id} project={@props.project_map?[@props.project_id]} name={name} />
            {@render_file_tabs(group == 'public') if not @props.fullscreen}
            <ProjectMainContent
                project_id      = {@props.project_id}
                project_name    = {@props.name}
                active_tab_name = {@props.active_project_tab}
                group           = {group}
                open_files      = {@props.open_files}
            />
        </div>

exports.MobileProjectPage = rclass ({name}) ->
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

    propTypes :
        project_id : rtypes.string

    render_files_dropdown: ->
        if not @props.open_files_order?
            return

        dropdown_title = "Open Files"
        path = misc.tab_to_path(@props.active_project_tab)
        if @props.open_files_order.includes(path)
            dropdown_title = misc.trunc(misc.path_split(path).tail, 64)

        items = []
        @props.open_files_order.map (path, index) =>
            items.push(@file_menu_item(path, index))
        <NavDropdown id="smc-project-files-dropdown" title={dropdown_title} style={width:'100%', fontSize:'17px', textAlign:'left'}>
            {items}
        </NavDropdown>

    close_file_item : (e, path) ->
        e.stopPropagation()
        e.preventDefault()
        @actions(project_id:@props.project_id).close_tab(path)

    file_menu_item: (path, index) ->
        ext = misc.filename_extension(path).toLowerCase()
        icon = file_associations[ext]?.icon ? 'code-o'
        display_name = misc.trunc(misc.path_split(path).tail, 64)

        label_styles =
            whiteSpace   : 'nowrap'
            overflow     : 'hidden'
            textOverflow : 'ellipsis'

        x_button_styles =
            float      : 'right'
            whiteSpace : 'nowrap'
            fontSize   : '12pt'

        <MenuItem
            key={path}
            onClick={()=>@actions(project_id: @props.project_id).set_active_tab(misc.path_to_tab(path))}
        >
            <div style={width:'100%'}>
                <div style={x_button_styles}>
                    <Button bsStyle="warning" onClick={(e)=>@close_file_item(e, path)}>
                        <Icon
                            name = 'times'
                        />
                    </Button>
                </div>
                <div style={label_styles}>
                    <Icon style={fontSize:'10pt'} name={icon} /> {display_name}
                </div>
            </div>
        </MenuItem>

    render_one_file_item : ->
        path         = @props.open_files_order.get(0)
        ext          = misc.filename_extension(path).toLowerCase()
        icon         = file_associations[ext]?.icon ? 'code-o'
        display_name = misc.trunc(misc.path_split(path).tail, 64)
        <FileTab
            key        = {path}
            name       = {misc.path_to_tab(path)}
            label      = {display_name}
            icon       = {icon}
            tooltip    = {path}
            project_id = {@props.project_id}
            file_tab   = {true}
            is_active  = {@props.active_project_tab == misc.path_to_tab(path)}
        />

    render : ->
        if not @props.open_files_order?
            return <Loading />

        <div className='container-content'  style={display: 'flex', flexDirection: 'column', flex: 1}>
            <ProjectWarning project_id={@props.project_id} project={@props.project_map?.get(@props.project_id)} name={name} />
            {<div className="smc-file-tabs" ref="projectNav" style={width:"100%", height:"37px"}>
                <Nav bsStyle="pills" className="smc-file-tabs-fixed-mobile" style={float:'left'}>
                    {[<FileTab
                        name       = {k}
                        label      = {v.label}
                        icon       = {v.icon}
                        tooltip    = {v.tooltip}
                        project_id = {@props.project_id}
                        is_active  = {@props.active_project_tab == k}
                        shrink     = {@props.open_files_order.size != 0 or $(window).width() < 370}
                    /> for k, v of fixed_project_pages]}
                </Nav>
                <Nav bsStyle="pills" className="smc-file-tabs-files-mobile" style={display:'flex'}>
                    {@render_files_dropdown() if @props.open_files_order.size > 1}
                    {@render_one_file_item() if @props.open_files_order.size == 1}
                </Nav>
            </div> if not @props.fullscreen}
            <ProjectMainContent
                project_id      = {@props.project_id}
                project_name    = {@props.name}
                active_tab_name = {@props.active_project_tab}
                group           = {@props.get_my_group(@props.project_id)}
                open_files      = {@props.open_files}
            />
        </div>
