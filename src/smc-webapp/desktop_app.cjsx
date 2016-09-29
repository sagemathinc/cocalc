{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{Navbar, Nav, NavItem} = require('react-bootstrap')
{Loading, Icon, Tip} = require('./r_misc')

# SMC Pages
# SMELL: Page UI's are mixed with their store/state.
# So we have to require them even though they aren't used
{HelpPage} = require('./r_help')
{ProjectsPage} = require('./projects')
{ProjectPage} = require('./project_page')
{AccountPage} = require('./account_page') # SMELL: Not used but gets around a webpack error..
{FileUsePage} = require('./file_use')
{Support} = require('./support')

# SMC Libraries
misc = require('smc-util/misc')
immutable = require('immutable')

{SortableContainer, SortableElement} = require('react-sortable-hoc')

# Makes some things work. Like the save button
require('./jquery_plugins')

# Initializes page actions, store, and listeners
require('./init_app')

{ActiveAppContent, CookieWarning, ConnectionIndicator, ConnectionInfo, FullscreenButton, NavTab, SMCLogo, VersionWarning} = require('./app_shared')
###
# JSX
###

ProjectTab = rclass
    reduxProps:
        projects:
            get_title : rtypes.func

    propTypes:
        project_map           : rtypes.object # immutable.Map
        index                 : rtypes.number
        project_id            : rtypes.string
        active_top_tab        : rtypes.string

    getInitialState : ->
        x_hovered : false

    close_tab : (e) ->
        e.stopPropagation()
        e.preventDefault()
        @actions('page').close_project_tab(@props.project_id)

    render : ->
        title = @props.get_title(@props.project_id)
        if not title?
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
            actions={@actions('page')}
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

NavWrapper = ({style, children, id, className}) ->
    React.createElement(Nav, {style:style, id:id, className:className}, children)

SortableNavTab = SortableElement(NavTab)
SortableNav = SortableContainer(NavWrapper)

GhostTab = (props) ->
    <NavItem
        style={flexShrink:'1', width:'200px', height:'42px', overflow: 'hidden'}
    />

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
            open_projects  : rtypes.immutable.List.isRequired # List of open projects and their state
            project_map    : rtypes.immutable.isRequired # All projects available to the user
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
            num_ghost_tabs    : rtypes.number
        file_use :
            get_notify_count : rtypes.func
        account :
            get_fullname : rtypes.func
            is_logged_in : rtypes.func
        support :
            show : rtypes.bool

    propTypes :
        redux : rtypes.object

    getDefaultProps : ->
        num_ghost_tabs : 0

    componentWillUnmount : ->
        @actions('page').clear_all_handlers()

    on_sort_end : ({oldIndex, newIndex}) ->
        @actions('projects').move_project_tab({old_index:oldIndex, new_index:newIndex, open_projects:@props.open_projects})

    render_project_tabs : ->
        <SortableNav style={display:'flex', flex:'1', overflow: 'hidden', margin:'0'}
            helperClass={'smc-project-tab-floating'}
            onSortEnd={@on_sort_end}
            axis={'x'}
            lockAxis={'x'}
            lockToContainerEdges={true}
            distance={3}
        >
            {@project_tabs()}
        </SortableNav>

    project_tabs : ->
        v = []
        if not @props.open_projects?
            return
        @props.open_projects.map (project_id, index) =>
            v.push(@project_tab(project_id, index))

        if @props.num_ghost_tabs == 0
            return v

        num_real_tabs = @props.open_projects.size
        num_tabs = num_real_tabs + @props.num_ghost_tabs
        console.log("NUMBER OF GHOST TABS:", @props.num_ghost_tabs)
        for index in [num_real_tabs..(num_tabs-1)]
            console.log("adding a ghost index:", index)
            v.push(<GhostTab index={index} key={index}/>)
        return v

    project_tab : (project_id, index) ->
        <ProjectTab
            index          = {index}
            key            = {project_id}
            project_id     = {project_id}
            active_top_tab = {@props.active_top_tab}
            project_map    = {@props.project_map}
            public_project_titles = {@props.public_project_titles}
        />

    account_name : ->
        name = ''
        if @props.get_fullname?
            name = misc.trunc_middle(@props.get_fullname(), 32)
        if not name.trim()
            name = "Account"
        return name

    render_right_nav : ->
        <Nav id='smc-right-tabs-fixed' style={height:'42px', lineHeight:'20px', margin:'0'}>
            <NavTab
                name='account'
                label={@account_name()}
                icon='cog'
                actions={@actions('page')}
                active_top_tab={@props.active_top_tab}
            />
            <NavTab name='about' label='About' icon='question-circle' actions={@actions('page')} active_top_tab={@props.active_top_tab} />
            <NavItem className='divider-vertical hidden-xs' />
            <NavTab label='Help' icon='medkit' actions={@actions('page')} active_top_tab={@props.active_top_tab} on_click={=>redux.getActions('support').show(true)} />
            {<NotificationBell count={@props.get_notify_count()} /> if @props.is_logged_in()}
            <ConnectionIndicator actions={@actions('page')} />
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
                actions={@actions('page')}
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
            .input-group {
                z-index:0;
            }'
        shim_style =
            position    : 'absolute'
            left        : '0'
            marginRight : '0px'
            marginLeft  : '0px'
            paddingLeft : '0px'
            width       : '100%'
            display     : 'flex'

        style =
            display:'flex'
            flexDirection:'column'
            height:'100vh'
            width:'100vw'
            overflow:'auto'

        <div ref="page" style={style}>
            <style>{page_style}</style>
            {<FileUsePageWrapper /> if @props.show_file_use}
            {<ConnectionInfo ping={@props.ping} status={@props.connection_status} avgping={@props.avgping} actions={@actions('page')} /> if @props.show_connection}
            {<Support actions={@actions('support')} /> if @props.show}
            {<VersionWarning new_version={@props.new_version} /> if @props.new_version?}
            {<CookieWarning /> if @props.cookie_warning}
            {<Navbar style={marginBottom: 0, overflowY:'hidden', width:'100%', minHeight:'42px', position:'fixed', right:'0', zIndex:'100', opacity:'0.8'}>
                <div id="smc-top-nav-shim" style={shim_style} >
                    {@render_project_nav_button() if @props.is_logged_in()}
                    {@render_project_tabs()}
                    {@render_right_nav()}
                </div>
            </Navbar> if not @props.fullscreen}
            {<div className="smc-sticky-position-hack" style={minHeight:'42px'}> </div>if not @props.fullscreen}
            <FullscreenButton />
            {# Children must define their own padding from navbar and screen borders}
            {# Note that the parent is a flex container}
            <ActiveAppContent active_top_tab={@props.active_top_tab}/>
        </div>

$('body').css('padding-top':0).append('<div class="page-container smc-react-container" style="overflow:hidden;position:absolute;top:0px;"></div>')
page = <Redux redux={redux}>
    <Page redux={redux}/>
</Redux>
ReactDOM.render(page, $(".smc-react-container")[0])
