{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{Button, Navbar, Nav, NavItem, NavDropdown, MenuItem} = require('react-bootstrap')
Sidebar = require('react-sidebar').default
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
# Makes some things work. Like the save button
require('./jquery_plugins')
# Initializes page actions, store, and listeners
require('./init_app')
{ActiveAppContent, CookieWarning, ConnectionIndicator, ConnectionInfo, FullscreenButton, NavTab, SMCLogo, VersionWarning} = require('./app_shared')

OpenProjectMenuItem = rclass
    propTypes:
        project_map           : rtypes.object # immutable.Map
        open_projects         : rtypes.object # immutable.Map
        public_project_titles : rtypes.object # immutable.Map
        index                 : rtypes.number
        project_id            : rtypes.string
        active_top_tab        : rtypes.string

    getInitialState : ->
        x_hovered : false

    close_tab : (e) ->
        e.stopPropagation()
        e.preventDefault()
        @actions('page').close_project_tab(@props.project_id)

    open_project : (e) ->
        e.stopPropagation()
        e.preventDefault()
        @actions('page').set_active_tab(@props.project_id)

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

        <MenuItem onClick={@open_project}>
            {# Truncated file name}
            {# http://stackoverflow.com/questions/7046819/how-to-place-two-divs-side-by-side-where-one-sized-to-fit-and-other-takes-up-rem}
            <div style={width:'100%', lineHeight:'1.75em', color:text_color}>
                <div style = {float:'right', whiteSpace:'nowrap', fontSize:'12pt', marginTop:'-3px', color:x_color}>
                    <Button bsStyle="warning" onClick={@close_tab}>
                        <Icon
                            name = 'times'
                        />
                    </Button>
                </div>
                <div style={project_name_styles}>
                    <Tip title={misc.trunc(title,32)} tip={desc} placement='bottom' size='small'>
                        <Icon name={icon} style={fontSize:'20px'} />
                        <span style={marginLeft: "5px"}>{misc.trunc(title,24)}</span>
                    </Tip>
                </div>
            </div>
        </MenuItem>

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
        on_click : rtypes.func

    on_click : ->
        @actions('page').toggle_show_file_use()
        @props.on_click?()

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

# Project tabs's names are their project id
Page = rclass
    displayName : "Mobile-App"

    reduxProps :
        projects :
            open_projects  : rtypes.immutable # List of open projects and their state
            project_map    : rtypes.immutable # All projects available to the user
            get_title      : rtypes.func
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

    getInitialState : ->
        show_right_menu : false

    componentWillUnmount : ->
        @actions('page').clear_all_handlers()

    project_menu_items : ->
        v = []
        @props.open_projects.map (project_id, index) =>
            v.push(@project_tab(project_id, index))
        return v

    project_tab : (project_id, index) ->
        <OpenProjectMenuItem
            index          = {index}
            key            = {project_id}
            project_id     = {project_id}
            active_top_tab = {@props.active_top_tab}
            project_map    = {@props.project_map}
            open_projects  = {@props.open_projects}
            public_project_titles = {@props.public_project_titles}
        />

    account_name : ->
        name = ''
        if @props.get_fullname?
            name = misc.trunc_middle(@props.get_fullname(), 32)
        if not name.trim()
            name = "Account"
        return name

    render_projects_button : ->
        <Nav style={margin:'0', padding:'5px 5px 0px 5px'}>
            <NavItem onClick={(e)=>@actions('page').set_active_tab('projects')}>
                <SMCLogo />
            </NavItem>
        </Nav>

    render_projects_dropdown : ->
        if @props.open_projects.size == 0
            return <Nav style={margin:'0', flex:'1'}>
                <NavItem />
            </Nav>

        if @props.open_projects.includes(@props.active_top_tab)
            project_id = @props.active_top_tab

            title =  @props.get_title(project_id)
        else
            title = "Open projects"

        <Nav style={margin:'0', flex:'1', fontSize:'25px', textAlign:'center', padding:'15px'}>
            <NavDropdown title=title id="smc-projects-tabs">
                {@project_menu_items()}
            </NavDropdown>
        </Nav>

    render_one_project_tab : (project_id) ->
        project_name_styles =
            whiteSpace: 'nowrap'
            overflow: 'hidden'
            textOverflow: 'ellipsis'
        title = @props.get_title(project_id)

        desc = misc.trunc(@props.project_map?.getIn([@props.project_id, 'description']) ? '', 128)
        project_state = @props.project_map?.getIn([@props.project_id, 'state', 'state'])
        icon = require('smc-util/schema').COMPUTE_STATES[project_state]?.icon ? 'bullhorn'

        <Nav style={margin:'0', flex:'1', fontSize:'20px', padding:'15px'}>
            <NavItem onClick={(e)=>e.stopPropagation();e.preventDefault();@actions('page').set_active_tab(project_id)}>
                {# Truncated file name TODO: Make this pattern into an rclass. It's fuckin' everywhere}
                {# http://stackoverflow.com/questions/7046819/how-to-place-two-divs-side-by-side-where-one-sized-to-fit-and-other-takes-up-rem}
                <div style={width:'100%'}>
                    <div style = {float:'right', whiteSpace:'nowrap', fontSize:'12pt'}>
                        <Icon
                            name = 'times'
                            onClick={(e)=>e.stopPropagation();e.preventDefault();@actions('page').close_project_tab(project_id)}
                        />
                    </div>
                    <div style={project_name_styles}>
                        <Icon name={icon} style={fontSize:'20px'} />
                        <span style={marginLeft: "5px"}>{misc.trunc(title,24)}</span>
                    </div>
                </div>
            </NavItem>
        </Nav>

    render_right_menu_button : ->
        <Nav style={margin:'0', padding:'15px', paddingRight:'25px', fontSize:'20px', float:'right'}>
            <NavItem onClick={()=>@setState(show_right_menu: true)}>
                <Icon name="bars"/>
            </NavItem>
        </Nav>

    close_right_menu : ->
        @setState(show_right_menu:false)

    render_right_menu : ->
        # HACK: This is the dumbest fuckin' hack ever.
        # We should use a better sidemenu in the future.
        if not @state.show_right_menu
            return <div> </div>

        <div style={width:'40vw', height:'100vw', backgroundColor:'white'}>
            <Nav stacked>
                <NavTab
                    name='account'
                    label={@account_name()}
                    icon='cog'
                    actions={@actions('page')}
                    active_top_tab={@props.active_top_tab}
                    on_click={@close_right_menu}
                    style={width:'100%'}
                />
                <NavTab
                    on_click={@close_right_menu}
                    name='about'
                    label='About'
                    icon='question-circle'
                    actions={@actions('page')}
                    active_top_tab={@props.active_top_tab}
                    style={width:'100%'}
                />
                <NavTab
                    label='Help'
                    icon='medkit'
                    actions={@actions('page')}
                    active_top_tab={@props.active_top_tab}
                    on_click={=>@close_right_menu();redux.getActions('support').show(true)}
                    style={width:'100%'}
                />
                {<NotificationBell
                    on_click={@close_right_menu}
                    count={@props.get_notify_count()}
                /> if @props.is_logged_in()}
                <ConnectionIndicator
                    on_click={@close_right_menu}
                    actions={@actions('page')}
                />
            </Nav>
        </div>

    render : ->
        # Use this pattern very sparingly.
        # Right now only used to access library generated elements
        # Very fragile.
        page_style ='
            #smc-top-bar>.container>ul>li>a {
                padding:0px;
            }
            #smc-top-bar>.container {
                display:flex;
                padding:0px;
            }
            #smc-projects-tabs {
                padding:10px;
            }
            .input-group {
                z-index:0;
            }'
        style =
            height:'100vh'
            width:'100vw'
            overflow:'auto'

        shim_style =
            position : 'absolute'
            left : '0'
            marginRight : '0px'
            marginLeft : '0px'
            paddingLeft : '0px'
            width : '100%'
            display : 'flex'

        <div ref="page" style={style}>
            <Sidebar sidebar={@render_right_menu()}
                open={@state.show_right_menu}
                onSetOpen={(open)=>@setState(show_right_menu:open)}
                pullRight={true}
                shadow={false}
                touch={false}
            >
                <style>{page_style}</style>
                {<FileUsePageWrapper /> if @props.show_file_use}
                {<Support actions={@actions('support')} /> if @props.show}
                {<ConnectionInfo ping={@props.ping} status={@props.connection_status} avgping={@props.avgping} actions={@actions('page')} /> if @props.show_connection}
                {<VersionWarning new_version={@props.new_version} /> if @props.new_version?}
                {<CookieWarning /> if @props.cookie_warning}
                {<Navbar id="smc-top-bar" style={margin:'0px'}>
                    {@render_projects_button()}
                    {@render_projects_dropdown() if @props.open_projects.size > 1}
                    {@render_one_project_tab(@props.open_projects.get(0)) if @props.open_projects.size == 1}
                    {<div style={flex:'1'}> </div> if @props.open_projects.size == 0}
                    {@render_right_menu_button()}
                </Navbar> if not @props.fullscreen}
                <FullscreenButton />
                {# Children must define their own padding from navbar and screen borders}
                <ActiveAppContent active_top_tab={@props.active_top_tab} render_small={true}/>
            </Sidebar>
        </div>

$('body').css('padding-top':0).append('<div class="page-container smc-react-container" style="overflow:hidden"></div>')
page =
    <Redux redux={redux}>
        <Page />
    </Redux>

exports.render = () => ReactDOM.render(page, $(".smc-react-container")[0])