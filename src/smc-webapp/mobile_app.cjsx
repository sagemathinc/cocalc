{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')
{Button, Navbar, Nav, NavItem, NavDropdown, MenuItem} = require('react-bootstrap')
Sidebar = require('react-sidebar').default
{Loading, Icon, Tip} = require('./r_misc')

# SMC Pages
# SMELL: Page UI's are mixed with their store/state.
# So we have to require them even though they aren't used
{HelpPage}     = require('./r_help')
{ProjectsPage} = require('./projects')
{ProjectPage}  = require('./project_page')
{AccountPage}  = require('./account_page') # SMELL: Not used but gets around a webpack error..
{FileUsePage}  = require('./file_use')
{Support}      = require('./support')

# SMC Libraries
misc = require('smc-util/misc')

{ProjectsNav} = require('./projects_nav')
{ActiveAppContent, CookieWarning, LocalStorageWarning, ConnectionIndicator, ConnectionInfo, FullscreenButton, NavTab, NotificationBell, SMCLogo, VersionWarning} = require('./app_shared')

FileUsePageWrapper = (props) ->
    styles =
        zIndex       : '10'
        marginLeft   : '0'
        position     : 'fixed'
        boxShadow    : '0 0 15px #aaa'
        border       : '2px solid #ccc'
        top          : '43px'
        background   : '#fff'
        right        : '2em'
        overflowY    : 'auto'
        overflowX    : 'hidden'
        fontSize     : '10pt'
        padding      : '4px'
        borderRadius : '5px'
        width        : '50%'
        height       : '90%'

    <div style={styles}>
        {<FileUsePage redux={redux} />}
    </div>

# Project tabs's names are their project id
Page = rclass
    displayName : "Mobile-App"

    reduxProps :
        page :
            active_top_tab    : rtypes.string    # key of the active tab
            show_connection   : rtypes.bool
            ping              : rtypes.number
            avgping           : rtypes.number
            connection_status : rtypes.string
            new_version       : rtypes.object
            fullscreen        : rtypes.bool
            cookie_warning    : rtypes.bool
            local_storage_warning : rtypes.bool
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

    getInitialState: ->
        show_right_menu : false

    componentWillUnmount: ->
        @actions('page').clear_all_handlers()

    account_name: ->
        name = ''
        if @props.get_fullname?
            name = misc.trunc_middle(@props.get_fullname(), 32)
        if not name.trim()
            name = "Account"
        return name

    render_projects_button: ->
        <Nav style={margin:'0', padding:'5px 5px 0px 5px'}>
            <NavItem onClick={(e)=>@actions('page').set_active_tab('projects')}>
                <SMCLogo />
            </NavItem>
        </Nav>

    render_right_menu_button: ->
        <Nav style={margin:'0', padding:'15px', paddingRight:'25px', fontSize:'20px', float:'right'}
            onClick={()=>@setState(show_right_menu: true)}
        >
            <NavItem>
                <Icon name="bars"/>
            </NavItem>
        </Nav>

    close_right_menu: ->
        @setState(show_right_menu:false)

    render_right_menu: ->
        # HACK: This is the dumbest hack ever.
        # We should use a better sidemenu in the future.
        if not @state.show_right_menu
            return <div> </div>

        <div style={width:'40vw', height:'100vw', backgroundColor:'white'}>
            <Nav stacked>
                <NavTab
                    name           = 'account'
                    label          = {@account_name()}
                    icon           = 'cog'
                    actions        = {@actions('page')}
                    active_top_tab = {@props.active_top_tab}
                    on_click       = {@close_right_menu}
                    style          = {width:'100%'}
                />
                <NavTab
                    on_click       = {@close_right_menu}
                    name           = 'about'
                    label          = 'About'
                    icon           = 'question-circle'
                    actions        = {@actions('page')}
                    active_top_tab = {@props.active_top_tab}
                    style          = {width:'100%'}
                />
                <NavTab
                    label          = 'Help'
                    icon           = 'medkit'
                    actions        = {@actions('page')}
                    active_top_tab = {@props.active_top_tab}
                    on_click       = {=>@close_right_menu();redux.getActions('support').show(true)}
                    style          = {width:'100%'}
                />
                {<NotificationBell
                    on_click = {@close_right_menu}
                    count    = {@props.get_notify_count()}
                /> if @props.is_logged_in()}
                <ConnectionIndicator
                    on_click = {@close_right_menu}
                    actions  = {@actions('page')}
                />
            </Nav>
        </div>

    render: ->
        # Use this pattern very sparingly.
        # Right now only used to access library generated elements
        # Very fragile.
        page_style ='
            #smc-top-bar>.container>ul>li>a {
                padding:0px;
                -webkit-touch-callout: none; /* iOS Safari */
                -webkit-user-select: none;   /* Chrome/Safari/Opera */
                -khtml-user-select: none;    /* Konqueror */
                -moz-user-select: none;      /* Firefox */
                -ms-user-select: none;       /* Internet Explorer/Edge */
                user-select: none;           /* Non-prefixed version, currently
                                                not supported by any browser */
            }
            #smc-top-bar>.container {
                display:flex;
                padding:0px;
            }
            .input-group {
                z-index:0;
            }'
        style =
            height   : '100vh'
            width    : '100vw'
            overflow : 'auto'

        <div ref="page" style={style}>
            <Sidebar
                sidebar   = {@render_right_menu()}
                open      = {@state.show_right_menu}
                onSetOpen = {(open)=>@setState(show_right_menu:open)}
                pullRight = {true}
                shadow    = {false}
                touch     = {false}
                styles    = {content:{display:'flex', flexDirection:'column'}}
            >
                <style>{page_style}</style>
                <style>{ProjectsNav.dropdown_nav_page_styles}</style>
                {<FileUsePageWrapper /> if @props.show_file_use}
                {<Support actions={@actions('support')} /> if @props.show}
                {<ConnectionInfo ping={@props.ping} status={@props.connection_status} avgping={@props.avgping} actions={@actions('page')} /> if @props.show_connection}
                {<VersionWarning new_version={@props.new_version} /> if @props.new_version?}
                {<CookieWarning /> if @props.cookie_warning}
                {<LocalStorageWarning /> if @props.local_storage_warning}
                {<Navbar id="smc-top-bar" style={margin:'0px'}>
                    {@render_projects_button()}
                    <ProjectsNav dropdown={true} />
                    {@render_right_menu_button()}
                </Navbar> if not @props.fullscreen}
                {# Children must define their own padding from navbar and screen borders}
                <ActiveAppContent active_top_tab={@props.active_top_tab} render_small={true}/>
            </Sidebar>
        </div>

page =
    <Redux redux={redux}>
        <Page />
    </Redux>

exports.render = () =>
    ReactDOM.render(page, document.getElementById('smc-react-container'))

