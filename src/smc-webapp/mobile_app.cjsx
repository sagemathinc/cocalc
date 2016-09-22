{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{Navbar, Nav, NavItem} = require('react-bootstrap')
{Loading, Icon, Tip} = require('./r_misc')

# SMC Pages
{HelpPage} = require('./r_help')
{ProjectsPage} = require('./projects')
{ProjectPage} = require('./project_page')
{AccountPage} = require('./account_page')
{FileUsePage} = require('./file_use')
{Support} = require('./support')

# SMC Libraries
misc = require('smc-util/misc')

{SortableContainer, SortableElement} = require('react-sortable-hoc')

# Makes some things work. Like the save button
require('./jquery_plugins')

# Initializes page actions, store, and listeners
require('./init_app')

{CookieWarning, ConnectionIndicator, ConnectionInfo, FullscreenButton, SMCLogo, VersionWarning} = require('./app_shared')
###
# JSX
###

NavTab = rclass
    displayName : "NavTab"

    propTypes :
        label : rtypes.string
        icon : rtypes.oneOfType([rtypes.string, rtypes.object])
        close : rtypes.bool
        on_click : rtypes.func
        active_top_tab : rtypes.string
        actions : rtypes.object
        style : rtypes.object
        inner_style : rtypes.object

    make_icon : ->
        if typeof(@props.icon) == 'string'
            <Icon
                name={@props.icon}
                style={fontSize: 20, paddingRight: 2} />
        else if @props.icon?
            @props.icon

    on_click : (e) ->
        if @props.name?
            @actions('page').set_active_tab(@props.name)
        @props.on_click?()

    render : ->
        is_active = @props.active_top_tab == @props.name

        if @props.style?
            outer_style = @props.style
        else
            outer_style = {}

        outer_style.float = 'left'

        outer_style.fontSize ?= '14px'
        outer_style.cursor ?= 'pointer'
        outer_style.border = 'none'

        if is_active
            outer_style.backgroundColor = "#e7e7e7"

        if @props.inner_style
            inner_style = @props.inner_style
        else
            inner_style =
                padding : '10px'

        <NavItem
            active = {is_active}
            onClick = {@on_click}
            style = {outer_style}
        >
            <div style={inner_style}>
                {@make_icon()}
                {<span style={marginLeft: 5}>{@props.label}</span> if @props.label?}
                {@props.children}
            </div>
        </NavItem>

OpenProjectItem = rclass
    propTypes:
        project_map           : rtypes.object # immutable.Map
        open_projects         : rtypes.object # immutable.Map
        public_project_titles : rtypes.object # immutable.Map
        index                 : rtypes.number
        num_ghost_tabs        : rtypes.number
        project_id            : rtypes.string
        active_top_tab        : rtypes.string

    getInitialState : ->
        x_hovered : false

    close_tab : (e) ->
        e.stopPropagation()
        e.preventDefault()
        index = @props.open_projects.indexOf(@props.project_id)
        size = @props.open_projects.size
        if @props.project_id == @props.active_top_tab
            next_active_tab = 'projects'
            if index == -1 or size <= 1

                next_active_tab = 'projects'
            else if index == size - 1
                next_active_tab = @props.open_projects.get(index - 1)
            else
                next_active_tab = @props.open_projects.get(index + 1)
            @actions('page').set_active_tab(next_active_tab)
        if index == size - 1
            @actions('page').clear_ghost_tabs()
        else
            @actions('page').add_a_ghost_tab(@props.num_ghost_tabs)

        @actions('projects').set_project_closed(@props.project_id)

    render : ->
        title = @props.project_map?.getIn([@props.project_id, 'title'])
        if not title?
            title = @props.public_project_titles?.get(@props.project_id)
            if not title?
                # Ensure that at some point we'll have the title if possible (e.g., if public)
                @actions('projects').fetch_public_project_title(@props.project_id)
                return <Loading key={@props.project_id} />
        desc = misc.trunc(@props.project_map?.getIn([@props.project_id, 'description']) ? '', 128)
        project_state = @props.project_map?.getIn([@props.project_id, 'state', 'state'])
        icon = require('smc-util/schema').COMPUTE_STATES[project_state]?.icon ? 'bullhorn'

        project_name_styles =
            whiteSpace: 'nowrap'
            overflow: 'hidden'
            textOverflow: 'ellipsis'

        if @props.project_id == @props.active_top_tab
            text_color = 'rgb(85, 85, 85)'

        if @state.x_hovered
            x_color = "white"

        <SortableNavTab
            index={@props.index}
            name={@props.project_id}
            actions={@actions('page_actions')}
            active_top_tab={@props.active_top_tab}
            style={flexShrink:'1', width:'200px', maxWidth:'200px', height:'42px', overflow: 'hidden'}
        >
            {# Truncated file name}
            {# http://stackoverflow.com/questions/7046819/how-to-place-two-divs-side-by-side-where-one-sized-to-fit-and-other-takes-up-rem}
            <div style={width:'100%', lineHeight:'1.75em', color:text_color}>
                <div style = {float:'right', whiteSpace:'nowrap', fontSize:'12pt', marginTop:'-3px', color:x_color}>
                    <Icon
                        name = 'times'
                        onClick = {@close_tab}
                        onMouseOver = {(e)=>@setState(x_hovered:true)}
                        onMouseOut = {(e)=>@actions('page').clear_ghost_tabs();@setState(x_hovered:false)}
                    />
                </div>
                <div style={project_name_styles}>
                    <Tip title={misc.trunc(title,32)} tip={desc} placement='bottom' size='small'>
                        <Icon name={icon} style={fontSize:'20px'} />
                        <span style={marginLeft: "5px"}>{misc.trunc(title,24)}</span>
                    </Tip>
                </div>
            </div>
        </SortableNavTab>

NavDropDownWrapper = ({style, children, id, className}) ->
    React.createElement(NavDropdown, {style:style, id:id, className:className}, children)

SortableOpenProjectItem = SortableElement(OpenProjectItem)
SortableDropDown = SortableContainer(NavDropDownWrapper)

FileUsePageWrapper = (props) ->
    styles =
        zIndex: '10'
        marginLeft: '0'
        position: 'fixed'
        boxShadow: '0 0 15px #aaa'
        border: '2px solid #ccc'
        top: '43px'
        background: '#fff'
        right: '2em'
        overflowY: 'auto'
        overflowX: 'hidden'
        fontSize: '10pt'
        padding: '4px'
        borderRadius: '5px'
        width: '50%'
        height: '90%'

    <div style={styles}>
        {<FileUsePage redux={redux} />}
    </div>

NotificationBell = rclass
    displayName: 'NotificationBell'

    propTypes :
        count : rtypes.number

    on_click : ->
        @actions('page').toggle_show_file_use()

    notification_count : ->
        count_styles =
            fontSize : '8pt'
            color : 'red'
            position : 'absolute'
            left : '18.5px'
            fontWeight : 700
            background : 'transparent'
        if @props.count > 0
            <span style={count_styles}>{@props.count}</span>

    render : ->
        outer_styles =
            position : 'relative'
            marginRight : '-10px'
            float : 'left'

        inner_styles =
            padding : '10px'
            fontSize : '17pt'
            color : '#666'
            cursor : 'pointer'

        <NavItem
            style={outer_styles}
            onClick={@on_click}
        >
            <div style={inner_styles} >
                <Icon name='bell-o' />
                {@notification_count()}
            </div>
        </NavItem>

Page = rclass
    displayName : "Page"

    reduxProps :
        projects :
            open_projects  : rtypes.immutable # List of open projects and their state
            project_map    : rtypes.immutable # All projects available to the user
            public_project_titles : rtypes.immutable
        page :
            active_top_tab    : rtypes.string    # key of the active tab
            show_connection   : rtypes.bool
            ping              : rtypes.number
            avgping           : rtypes.number
            connection_status : rtypes.string
            new_version       : rtypes.object
            fullscreen        : rtypes.bool
            cookie_warning    : rtypes.bool
            show_file_use     : rtypes.bool
        file_use :
            get_notify_count : rtypes.func
        account :
            get_fullname : rtypes.func
            is_logged_in : rtypes.func
        support :
            show : rtypes.bool

    propTypes :
        redux : rtypes.object
        page_actions : rtypes.object

    componentWillUnmount : ->
        @actions('page').clear_all_handlers()

    on_sort_end : ({oldIndex, newIndex}) ->
        @actions('projects').move_project_tab({old_index:oldIndex, new_index:newIndex, open_projects:@props.open_projects})

    render_projects_dropdown : ->
        <SortableNavDropDown style={display:'flex', flex:'1', overflow: 'hidden', margin:'0'}
            helperClass={'smc-project-tab-floating'}
            onSortEnd={@on_sort_end}
            axis={'x'}
            lockAxis={'x'}
            lockToContainerEdges={true}
            distance={3}
        >
            {@project_menu_items()}
        </SortableNavDropDown>

    project_menu_items : ->
        v = []
        if not @props.open_projects?
            return
        @props.open_projects.map (project_id, index) =>
            v.push(@project_tab(project_id, index))

        return v

    project_tab : (project_id, index) ->
        <OpenProjectItem
            index          = {index}
            key            = {project_id}
            project_id     = {project_id}
            active_top_tab = {@props.active_top_tab}
            project_map    = {@props.project_map}
            open_projects  = {@props.open_projects}
            num_ghost_tabs = {@props.num_ghost_tabs}
            public_project_titles = {@props.public_project_titles}
        />

    account_name : ->
        name = ''
        if @props.get_fullname?
            name = misc.trunc_middle(@props.get_fullname(), 32)
        if not name.trim()
            name = "Account"
        return name

    render_page : ->
        switch @props.active_top_tab
            when 'projects'
                return <ProjectsPage />
            when 'account'
                return <AccountPage />
            when 'about'
                return <HelpPage />
            when 'help'
                return <div>To be implemented</div>
            when undefined
                return
            else
                project_name = redux.getProjectStore(@props.active_top_tab).name
                <ProjectPage name={project_name} project_id={@props.active_top_tab} />

    render_right_menu : ->
        <Nav id='smc-right-tabs-fixed' style={height:'42px', lineHeight:'20px', margin:'0'}>
            <NavDropdown>
                <NavTab
                name='account'
                label={@account_name()}
                icon='cog'
                actions={@props.page_actions}
                active_top_tab={@props.active_top_tab}
                />
                <NavTab name='about' label='About' icon='question-circle' actions={@props.page_actions} active_top_tab={@props.active_top_tab} />
                <NavItem className='divider-vertical hidden-xs' />
                <NavTab label='Help' icon='medkit' actions={@props.page_actions} active_top_tab={@props.active_top_tab} on_click={=>redux.getActions('support').show(true)} />
                {<NotificationBell count={@props.get_notify_count()} /> if @props.is_logged_in()}
            </NavDropdown>

        </Nav>

    render_project_nav_button : ->
        projects_styles =
            whiteSpace: 'nowrap'
            float:'right'
            padding: '11px 7px'

        <Nav style={height:'42px', margin:'0'}>
            <NavTab
                name='projects'
                style={maxHeight:'44px'}
                inner_style={padding:'0px'}
                actions={@props.page_actions}
                active_top_tab={@props.active_top_tab}

            >
                {# http://stackoverflow.com/questions/7046819/how-to-place-two-divs-side-by-side-where-one-sized-to-fit-and-other-takes-up-rem}
                <div style={width:'100%'}>
                    <div style={projects_styles}>
                        Projects
                    </div>
                    <SMCLogo />
                </div>
            </NavTab>
        </Nav>

    render : ->
        # Use this pattern very sparingly.
        # Right now only used to access library generated elements
        # Very fragile.
        page_style ='
            #smc-top-nav-shim>ul>li>a {
                padding:0px;
            }
            .smc-project-tab-floating {
                background-color: rgb(255, 255, 255);
                border: dotted 1px #9a9a9a;
                display:block;
                line-height:normal;
                list-style-image:none;
                list-style-position:outside;
                list-style-type:none;
                z-index:100;
            }
            .smc-project-tab-floating>a {
                color:rgb(85, 85, 85);
                display:block;
                height:51px;
                line-height:20px;
                list-style-image:none;
                list-style-position:outside;
                list-style-type:none;
                outline-color:rgb(85, 85, 85);
                outline-style:none;
                outline-width:0px;
                padding:0px;
            }
            '
        shim_style =
            position : 'absolute'
            left : '0'
            marginRight : '0px'
            marginLeft : '0px'
            paddingLeft : '0px'
            width : '100%'
            display : 'flex'

        style =
            display:'flex'
            flexDirection:'column'
            height:'100vh'
            width:'100vw'
            overflow:'auto'

        <div ref="page" style={style}>
            <style>{page_style}</style>
            {<FileUsePageWrapper /> if @props.show_file_use}
            {<Support actions={@actions('support')} /> if @props.show}
            {<ConnectionInfo ping={@props.ping} status={@props.connection_status} avgping={@props.avgping} actions={@props.page_actions} /> if @props.show_connection}
            {<VersionWarning new_version={@props.new_version} /> if @props.new_version?}
            {<CookieWarning /> if @props.cookie_warning}
            {<Navbar style={marginBottom: 0, overflowY:'hidden', width:'100%', minHeight:'42px', position:'relative', right:'0', zIndex:'100', opacity:'0.8'}>
                <div id="smc-top-nav-shim" style={shim_style} >
                    <Nav>
                        {@render_projects_dropdown()}
                    </Nav>
                    <Nav>
                        {@render_right_menu()}
                    </Nav>
                    <Nav>
                        <ConnectionIndicator actions={@props.page_actions} />
                    </Nav>
                </div>
            </Navbar> if not @props.fullscreen}
            <FullscreenButton />
            {# Children must define their own padding from navbar and screen borders}
            {# Note that the parent is a flex container}
            {@render_page()}
        </div>

$('body').css('padding-top':0).append('<div class="page-container smc-react-container" style="overflow:hidden"></div>')
page = <Redux redux={redux}>
    <Page redux={redux} page_actions={redux.getActions('page')} notification_count=1 />
</Redux>
ReactDOM.render(page, $(".smc-react-container")[0])
