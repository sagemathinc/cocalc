{isMobile} = require('./feature')

{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

{Navbar, Nav, NavItem} = require('react-bootstrap')
{Loading, Icon, Tip}   = require('./r_misc')

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

Page = rclass
    displayName : "Page"

    reduxProps :
        projects :
            open_projects     : rtypes.immutable.List
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
            file_use         : rtypes.immutable.Map
            get_notify_count : rtypes.func
        account :
            first_name   : rtypes.string # Necessary for get_fullname
            last_name    : rtypes.string # Necessary for get_fullname
            get_fullname : rtypes.func
            user_type    : rtypes.string # Necessary for is_logged_in
            is_logged_in : rtypes.func
        support :
            show : rtypes.bool

    propTypes :
        redux : rtypes.object

    componentWillUnmount: ->
        @actions('page').clear_all_handlers()

    account_name: ->
        name = ''
        if @props.get_fullname?
            name = misc.trunc_middle(@props.get_fullname(), 32)
        if not name.trim()
            name = "Account"

        return name

    render_account_tab: ->
        <NavTab
            name           = 'account'
            label          = {@account_name()}
            icon           = 'cog'
            actions        = {@actions('page')}
            active_top_tab = {@props.active_top_tab}
        />

    sign_in_tab_clicked: ->
        if @props.active_top_tab == 'account'
            @actions('page').sign_in()

    render_sign_in_tab: ->
        <NavTab
            name           = 'account'
            label          = 'Sign in'
            icon           = 'sign-in'
            on_click       = {@sign_in_tab_clicked}
            actions        = {@actions('page')}
            active_top_tab = {@props.active_top_tab}
        />

    render_right_nav: ->
        logged_in = @props.is_logged_in()
        <Nav id='smc-right-tabs-fixed' style={height:'41px', lineHeight:'20px', margin:'0', overflowY:'hidden'}>
            {@render_account_tab() if logged_in}
            {@render_sign_in_tab() if not logged_in}
            <NavTab name='about' label='About' icon='question-circle' actions={@actions('page')} active_top_tab={@props.active_top_tab} />
            <NavItem className='divider-vertical hidden-xs' />
            {<NavTab label='Help' icon='medkit' actions={@actions('page')} active_top_tab={@props.active_top_tab} on_click={=>redux.getActions('support').show(true)} /> if require('./customize').commercial}
            {<NotificationBell count={@props.get_notify_count()} /> if @props.is_logged_in()}
            <ConnectionIndicator actions={@actions('page')} />
        </Nav>

    render_project_nav_button: ->
        projects_styles =
            whiteSpace : 'nowrap'
            float      : 'right'
            padding    : '11px 7px'

        <Nav style={height:'41px', margin:'0', overflow:'hidden'}>
            <NavTab
                name           = 'projects'
                inner_style    = {padding:'0px'}
                actions        = {@actions('page')}
                active_top_tab = {@props.active_top_tab}

            >
                <div style={projects_styles}>
                    Projects
                </div>
                <SMCLogo />
            </NavTab>
        </Nav>

    # register a default drag and drop handler, that prevents accidental file drops
    # therefore, dropping files only works when done right above the dedicated dropzone
    # TEST: make sure that usual drag'n'drop activities like rearranging tabs and reordering tasks work
    drop: (e) ->
        if DEBUG
            e.persist()
            console.log "react desktop_app.drop", e
        e.preventDefault()
        e.stopPropagation()
        {alert_message} = require('./alerts')
        alert_message
            type     : 'info'
            title    : 'File drop disabled'
            message  : 'To upload a file, drop it onto the files listing or the "Drop files to upload" area in the +New tab.'

    render: ->
        style =
            display       : 'flex'
            flexDirection : 'column'
            height        : '100vh'
            width         : '100vw'
            overflow      : 'auto'

        style_top_bar =
            display       : 'flex'
            marginBottom  : 0
            width         : '100%'
            minHeight     : '42px'
            position      : 'fixed'
            right         : '0'
            zIndex        : '100'
            opacity       : '0.8'

        <div ref="page" style={style} onDragOver={(e) -> e.preventDefault()} onDrop={@drop}>
            {<FileUsePageWrapper /> if @props.show_file_use}
            {<ConnectionInfo ping={@props.ping} status={@props.connection_status} avgping={@props.avgping} actions={@actions('page')} /> if @props.show_connection}
            {<Support actions={@actions('support')} /> if @props.show}
            {<VersionWarning new_version={@props.new_version} /> if @props.new_version?}
            {<CookieWarning /> if @props.cookie_warning}
            {<LocalStorageWarning /> if @props.local_storage_warning}
            {<Navbar className="smc-top-bar" style={style_top_bar}>
                {@render_project_nav_button() if @props.is_logged_in()}
                <ProjectsNav dropdown={false} />
                {@render_right_nav()}
            </Navbar> if not @props.fullscreen}
            {<div className="smc-sticky-position-hack" style={minHeight:'42px'}> </div>if not @props.fullscreen}
            <FullscreenButton />
            {# Children must define their own padding from navbar and screen borders}
            {# Note that the parent is a flex container}
            <ActiveAppContent active_top_tab={@props.active_top_tab}/>
        </div>

page = <Redux redux={redux}>
    <Page redux={redux}/>
</Redux>

exports.render = () => ReactDOM.render(page, document.getElementById('smc-react-container'))