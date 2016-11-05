###
project page react component
###
{IS_MOBILE} = require('./feature')

# 3rd party Libraries
{Button, Nav, NavItem, NavDropdown, MenuItem, Alert, Col, Row} = require('react-bootstrap')
{SortableContainer, SortableElement} = require('react-sortable-hoc')

{SideChat} = require('./side_chat')

# SMC Libraries
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

misc = require('misc')

FILE_NAV_HEIGHT = '36px'

default_file_tab_styles =
    width : 250
    borderRadius : "5px 5px 0px 0px"
    flexShrink : '1'
    overflow : 'hidden'

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
            styles = misc.copy(default_file_tab_styles)
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
        style={default_file_tab_styles}
    />

SortableFileTab = SortableElement(FileTab)
SortableNav = SortableContainer(NavWrapper)

FreeProjectWarning = rclass ({name}) ->
    displayName : 'FreeProjectWarning'

    reduxProps :
        projects :
            # get_total_project_quotas relys on this data
            # Will be removed by #1084
            project_map              : rtypes.immutable.Map
            get_total_project_quotas : rtypes.func
        "#{name}" :
            free_warning_extra_shown : rtypes.bool
            free_warning_closed      : rtypes.bool

    propTypes :
        project_id : rtypes.string

    shouldComponentUpdate : (nextProps) ->
        return @props.free_warning_extra_shown != nextProps.free_warning_extra_shown or
            @props.free_warning_closed != nextProps.free_warning_closed or
            @props.project_map?.get(@props.project_id)?.get('users') != nextProps.project_map?.get(@props.project_id)?.get('users')

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

    render : ->
        if not require('./customize').commercial
            return null
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
            color      : 'gray'
            position   : 'relative'
            height     : 0
        <Alert bsStyle='warning' style={styles}>
            <Icon name='exclamation-triangle' /> WARNING: This project runs {<span>on a <b>free server (which may be unavailable during peak hours)</b></span> if host} {<span>without <b>internet access</b></span> if internet} &mdash;
            <a onClick={=>@actions(project_id: @props.project_id).show_extra_free_warning()}> learn more...</a>
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

CHAT_TOGGLE_STYLE =
    fontSize     : '14pt'
    position     : 'absolute'
    top          : '3px'
    right        : '3px'
    zIndex       : 10
    boxShadow    : '2px 2px 2px 2px #ccc'
    background   : '#fafafa'
    borderRadius : '3px'
    paddingLeft  : '5px'
    paddingRight : '5px'

CHAT_TOGGLE_TIP = <span>
Hide or show the chat for this file.
<hr/>
Use HTML, Markdown, and LaTeX in your chats,
and press shift+enter to send them.
Your collaborators will be notified.

</span>

# Children must define their own padding from navbar and screen borders
ProjectMainContent = rclass
    propTypes :
        project_id      : rtypes.string.isRequired
        project_name    : rtypes.string.isRequired
        open_files      : rtypes.object
        active_tab_name : rtypes.string
        group           : rtypes.string

    toggle_chat: (set_open, path) ->
        a = redux.getProjectActions(@props.project_id)
        if set_open
            a.open_chat({path:path})
        else
            a.close_chat({path:path})

    render_chat_toggle : (is_chat_open, path) ->
        action = if is_chat_open then 'Hide' else 'Show'
        title  = <span><Icon name='comment'/><Space/> <Space/> {action} chat</span>
        <div style={CHAT_TOGGLE_STYLE}>
            <Tip
                title     = {title}
                tip       = {CHAT_TOGGLE_TIP}
                placement = 'left'
                delayShow = 1200
                >
                <div style={cursor:'pointer'} onClick={=>@toggle_chat(not is_chat_open, path)} >
                    <Icon name="caret-#{if is_chat_open then 'down' else 'left'}"/>
                    <Space />
                    <Icon name='comment'/>
                </div>
            </Tip>
        </div>

    render_editor: (path) ->
        {Editor, redux_name} = @props.open_files.getIn([path, 'component']) ? {}
        if not Editor?
            <Loading />
        else
            <Editor
                name         = {redux_name}
                path         = {path}
                project_id   = {@props.project_id}
                redux        = {redux}
                actions      = {if redux_name? then redux.getActions(redux_name)}
                project_name = {@props.project_name}
            />

    render_side_chat: (path) ->
        <SideChat
            path       = {misc.meta_file(path, 'chat')}
            redux      = {redux}
            project_id = {@props.project_id}
            />

    render_editor_tab: ->
        path         = misc.tab_to_path(@props.active_tab_name)
        editor       = @render_editor(path)
        is_chat_open = @props.open_files.getIn([path, 'is_chat_open'])
        chat_toggle  = @render_chat_toggle(is_chat_open, path)

        if is_chat_open
            # 2 column layout with chat
            content =\
                <div style={display:'flex', height:'100%'}>
                    <div style={width:'75%', border:'1px solid lightgrey'}>
                        {editor}
                    </div>
                    <div style={width:'25%', border:'1px solid lightgrey'}>
                        {@render_side_chat(path)}
                    </div>
                </div>
        else
            # just the editor
            content =\
                <div style={height:'100%', border:'1px solid lightgrey'}>
                    {editor}
                </div>
        # Finally render it
        <div style={position:'relative', height:0, flex:1}>
            {chat_toggle}
            {content}
        </div>

    render : ->
        switch @props.active_tab_name
            when 'files'
                <ProjectFiles name={@props.project_name} project_id={@props.project_id} />
            when 'new'
                <ProjectNew name={@props.project_name} project_id={@props.project_id} />
            when 'log'
                <ProjectLog name={@props.project_name} />
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

    render : ->
        if not @props.open_files_order?
            return <Loading />

        shrink_fixed_tabs = $(window).width() < 376 + (@props.open_files_order.size + @props.num_ghost_file_tabs) * 250

        group     = @props.get_my_group(@props.project_id)
        is_public = (group == 'public')

        <div className='container-content' style={display: 'flex', flexDirection: 'column', flex: 1}>
            <FreeProjectWarning project_id={@props.project_id} name={name} />
            {<div className="smc-file-tabs" ref="projectNav" style={width:'100%', height:FILE_NAV_HEIGHT}>
                <Nav bsStyle="pills" className="smc-file-tabs-fixed-desktop" style={overflowY:'hidden', float:'left', height:FILE_NAV_HEIGHT} >
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
                    className   = "smc-file-tabs-files-desktop"
                    helperClass = {'smc-file-tab-floating'}
                    onSortEnd   = {@on_sort_end}
                    axis        = {'x'}
                    lockAxis    = {'x'}
                    lockToContainerEdges={true}
                    distance    = {3 if not IS_MOBILE}
                    bsStyle     = "pills"
                    style       = {display:'flex', height:FILE_NAV_HEIGHT, overflowY:'hidden'}
                >
                    {@file_tabs()}
                </SortableNav>
            </div> if not @props.fullscreen}
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
            <FreeProjectWarning project_id={@props.project_id} name={name} />
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
