#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
React Component for displaying the entire page on a mobile device.
###

{React, ReactDOM, rclass, redux, rtypes, Redux, redux_fields} = require('./app-framework')
{Button, Navbar, Nav, NavItem, MenuItem} = require('react-bootstrap')
{ErrorBoundary, Loading, Icon, Tip} = require('./r_misc')

# SMC Pages
# SMELL: Page UI's are mixed with their store/state.
# So we have to require them even though they aren't used
{ProjectPage}  = require('./project_page')
{FileUsePage}  = require('./file-use/page')
{Support}      = require('./support')
{ Avatar }     = require("./account/avatar/avatar");


# SMC Libraries
misc = require('smc-util/misc')

{ProjectsNav} = require('./projects_nav')
{ActiveAppContent, ConnectionIndicator, ConnectionInfo, NavTab, NotificationBell} = require('./app_shared')

{AppLogo} = require('./app/logo')

{VersionWarning, CookieWarning, LocalStorageWarning} = require("./app/warnings")

PAGE_REDUX_PROPS =
    page :
        active_top_tab    : rtypes.string    # key of the active tab
        show_connection   : rtypes.bool
        ping              : rtypes.number
        avgping           : rtypes.number
        connection_status : rtypes.string
        new_version       : rtypes.immutable.Map
        fullscreen        : rtypes.oneOf(['default', 'kiosk'])
        cookie_warning    : rtypes.bool
        local_storage_warning : rtypes.bool
        show_file_use     : rtypes.bool
    file_use :
        notify_count      : rtypes.number
    account :
        account_id        : rtypes.string
        is_logged_in      : rtypes.bool
    support :
        show : rtypes.bool
    customize:
        site_name         : rtypes.string

PAGE_REDUX_FIELDS = redux_fields(PAGE_REDUX_PROPS)

# Project tabs's names are their project id
Page = rclass
    displayName : "Mobile-App"

    reduxProps : PAGE_REDUX_PROPS

    propTypes :
        redux : rtypes.object

    getInitialState: ->
        show_menu : false

    shouldComponentUpdate: (props, state) ->
        return @state.show_menu != state.show_menu or \
               misc.is_different(@props, props, PAGE_REDUX_FIELDS)

    componentWillUnmount: ->
        @actions('page').clear_all_handlers()

    render_projects_button: ->
        <Nav style={margin:'0', padding:'5px 5px 0px 5px'}>
            <NavItem onClick={(e)=>@actions('page').set_active_tab('projects')}>
                <AppLogo />
            </NavItem>
        </Nav>

    render_menu_button: ->
        <Nav style={margin:'0', padding:'15px', paddingRight:'25px', fontSize:'20px', float:'right'}
            onClick={@toggle_menu}
        >
            <NavItem>
                <Icon name="bars"/>
            </NavItem>
        </Nav>

    toggle_menu: ->
        @setState ({show_menu}) ->
            show_menu : not show_menu

    close_menu: ->
        @setState(show_menu:false)

    render_menu: ->
        if @props.account_id
            a = <Avatar
                    size       = {20}
                    account_id = {@props.account_id}
                    no_tooltip = {true}
                    no_loading = {true}
                    />
        else
            a = 'cog'
        <div style={width:'100vw', backgroundColor:'white'}>
            <Nav stacked>
                <NavTab
                    on_click       = {@close_menu}
                    name           = {'account'}
                    label          = {'Account'}
                    icon           = {a}
                    actions        = {@actions('page')}
                    active_top_tab = {@props.active_top_tab}
                    style          = {width:'100%'}
                    inner_style    = {padding: '10px', display: 'flex', alignItems: 'center'}
                />
                <NavTab
                    on_click       = {@close_menu}
                    name           = {'about'}
                    label          = {@props.site_name}
                    icon           = {'info-circle'}
                    actions        = {@actions('page')}
                    active_top_tab = {@props.active_top_tab}
                    style          = {width:'100%'}
                    inner_style    = {padding: '10px', display: 'flex', alignItems: 'center'}
                />
                <NavTab
                    label          = {'Help'}
                    icon           = {'medkit'}
                    actions        = {@actions('page')}
                    active_top_tab = {@props.active_top_tab}
                    on_click       = {=>@close_menu(); @actions('support').show(true)}
                    style          = {width:'100%'}
                    inner_style    = {padding: '10px', display: 'flex', alignItems: 'center'}
                />
                {<NotificationBell
                    on_click = {=>@close_menu(); @actions('page').set_active_tab('file-use')}
                    count    = {@props.notify_count}
                    active   = {@props.show_file_use}
                /> if @props.is_logged_in}
                <ConnectionIndicator
                    on_click = {@close_menu}
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
            height        : '100vh'
            width         : '100vw'
            overflow      : 'auto'
            display       : 'flex'
            flexDirection : 'column'
            background    : 'white'

        <div ref="page" style={style}>
            <style>{page_style}</style>
            <style>{ProjectsNav.dropdown_nav_page_styles}</style>
            {<Support actions={@actions('support')} /> if @props.show}
            {<ConnectionInfo ping={@props.ping} status={@props.connection_status} avgping={@props.avgping} actions={@actions('page')} /> if @props.show_connection}
            {<VersionWarning new_version={@props.new_version} /> if @props.new_version?}
            {<CookieWarning /> if @props.cookie_warning}
            {<LocalStorageWarning /> if @props.local_storage_warning}
            {<Navbar id="smc-top-bar" style={margin:'0px'}>
                {@render_projects_button()}
                <ProjectsNav dropdown={true} />
                {@render_menu_button()}
            </Navbar> if not @props.fullscreen}
            {@render_menu() if (@state.show_menu and (@props.fullscreen != 'kiosk'))}
            {### Children must define their own padding from navbar and screen borders ###}
            <ErrorBoundary>
                <ActiveAppContent active_top_tab={@props.active_top_tab} render_small={true} kiosk_mode={@props.fullscreen == 'kiosk'}/>
            </ErrorBoundary>
        </div>

page =
    <Redux redux={redux}>
        <ErrorBoundary>
            <Page />
        </ErrorBoundary>
    </Redux>

exports.render = () =>
    ReactDOM.render(page, document.getElementById('smc-react-container'))

