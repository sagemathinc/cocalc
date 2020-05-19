#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

{isMobile} = require('./feature')

{React, ReactDOM, rclass, redux, rtypes, Redux, redux_fields} = require('./app-framework')

{Button, Navbar, Nav, NavItem} = require('react-bootstrap')
{ErrorBoundary, Loading, Space, Tip, Icon}   = require('./r_misc')
{COLORS} = require('smc-util/theme')
misc_page = require('./misc_page')

# CoCalc Pages
# SMELL: Page UI's are mixed with their store/state.
# So we have to require them even though they aren't used
{ProjectsPage} = require('./projects')
{ProjectPage}  = require('./project_page')
{FileUsePage}  = require('./file-use/page')
{Support}      = require('./support')
{ Avatar }     = require("./account/avatar/avatar");

# CoCalc Libraries
misc = require('smc-util/misc')

{ProjectsNav} = require('./projects_nav')
{ActiveAppContent, CookieWarning, GlobalInformationMessage, LocalStorageWarning, ConnectionIndicator, ConnectionInfo, FullscreenButton, NavTab, NotificationBell, AppLogo, VersionWarning, announce_bar_offset} = require('./app_shared')

nav_class = 'hidden-xs'

HIDE_LABEL_THOLD = 6

NAV_HEIGHT = 36

FileUsePageWrapper = (props) ->
    styles =
        zIndex       : '10'
        marginLeft   : '0'
        position     : 'fixed'
        boxShadow    : '0 0 15px #aaa'
        border       : '2px solid #ccc'
        top          : "#{NAV_HEIGHT - 2}px"
        background   : '#fff'
        right        : '2em'
        overflowY    : 'auto'
        overflowX    : 'hidden'
        fontSize     : '10pt'
        padding      : '4px'
        borderRadius : '5px'
        width        : '50%'
        height       : '90%'

    <div style={styles} className="smc-vfill">
        {<FileUsePage redux={redux} />}
    </div>

# TODO: important to nail down the data below as immutable and add shouldComponentUpdate, since
# this Page component gets massive not-needed rendering all the time!!!!

PAGE_REDUX_PROPS =
    projects :
        open_projects          : rtypes.immutable.List
    page :
        active_top_tab         : rtypes.string    # key of the active tab
        show_connection        : rtypes.bool
        ping                   : rtypes.number
        avgping                : rtypes.number
        connection_status      : rtypes.string
        new_version            : rtypes.immutable.Map
        fullscreen             : rtypes.oneOf(['default', 'kiosk'])
        cookie_warning         : rtypes.bool
        local_storage_warning  : rtypes.bool
        show_file_use          : rtypes.bool
    file_use :
        notify_count           : rtypes.number
    account :
        account_id             : rtypes.string
        is_logged_in           : rtypes.bool
        show_global_info       : rtypes.bool
        groups                 : rtypes.immutable.List
        is_anonymous           : rtypes.bool
        doing_anonymous_setup  : rtypes.bool
        created                : rtypes.object
    support :
        show                   : rtypes.bool
    customize:
        site_name              : rtypes.string

PAGE_REDUX_FIELDS = redux_fields(PAGE_REDUX_PROPS)

Page = rclass
    displayName : "Page"

    reduxProps : PAGE_REDUX_PROPS

    propTypes :
        redux : rtypes.object

    shouldComponentUpdate: (props, state) ->
        state_changed = misc.is_different(@state, state, ['show_label'])
        redux_changed = misc.is_different(@props, props, PAGE_REDUX_FIELDS)
        return redux_changed or state_changed

    getInitialState: ->
        show_label : true

    componentWillReceiveProps: (next) ->
        @setState(show_label : next.open_projects.size <= HIDE_LABEL_THOLD)

    componentWillUnmount: ->
        @actions('page').clear_all_handlers()

    render_account_tab: ->
        if @props.is_anonymous
            a = undefined
        else if @props.account_id
            a = <Avatar
                    size       = {20}
                    account_id = {@props.account_id}
                    no_tooltip = {true}
                    no_loading = {true}
                    />
        else
            a = 'cog'

        if @props.is_anonymous
            style={fontWeight:'bold', opacity:0}
            if @props.created and new Date().valueOf() - @props.created.valueOf() >= 1000*60*60*24*3
                mesg = "Sign Up NOW to avoid losing all of your work!"
                style.width = "400px";
            else
                mesg = "Sign Up"
            label = <Button id="anonymous-sign-up" bsStyle="success" style={style}>{mesg}</Button>
            style = {marginTop:'-10px'}  # compensate for using a button
            show_button = () => $("#anonymous-sign-up").css('opacity', 1)

            # We only actually show the button if it is still there a few seconds later.  This avoids flickering it
            # for a moment during normal sign in.  This feels like a hack, but was super quick to implement.
            setTimeout(show_button, 3000)
        else
            label = "Account"
            style = undefined

        <NavTab
            name           = 'account'
            label          = {label}
            style          = {style}
            label_class    = {nav_class}
            icon           = {a}
            actions        = {@actions('page')}
            active_top_tab = {@props.active_top_tab}
            show_label     = {@state.show_label}
        />

    # This is the new version with a dropdown menu.
    xxx_render_account_tab: ->
        if @props.is_anonymous
            return <NavTab
                        name           = 'account'
                        label          = {<Button bsStyle="success" style={fontWeight:'bold'}>Sign Up!</Button>}
                        style          = {{marginTop:'-10px'}}
                        label_class    = {nav_class}
                        icon           = {undefined}
                        actions        = {@actions('page')}
                        active_top_tab = {@props.active_top_tab}
                        show_label     = {@state.show_label}
                    />

        if @props.account_id
            a = <Avatar
                    size       = {20}
                    account_id = {@props.account_id}
                    no_tooltip = {true}
                    no_loading = {true}
                    />
        else # What does it mean to not have an account id?
            a = <Icon name='cog'/>

        return <AccountTabDropdown
                user_label = {@props.redux.getStore("account").get_fullname()}
                icon = {a}
                links = {<DefaultAccountDropDownLinks account_actions={@actions("account")}  page_actions={@actions("page")} />}
                label_class = {nav_class}
                show_label = {@state.show_label}
                is_active = {@props.active_top_tab == 'account'}
            />


    render_admin_tab: ->
        <NavTab
            name           = 'admin'
            label          = {'Admin'}
            label_class    = {nav_class}
            icon           = {'users'}
            inner_style    = {padding: '10px', display: 'flex'}
            actions        = {@actions('page')}
            active_top_tab = {@props.active_top_tab}
            show_label     = {@state.show_label}
        />

    sign_in_tab_clicked: ->
        if @props.active_top_tab == 'account'
            @actions('page').sign_in()

    render_sign_in_tab: ->
        if @props.active_top_tab != 'account'
            # Strongly encourage clicking on the sign in tab.
            # Especially important if user got signed out due
            # to cookie expiring or being deleted (say).
            style = {backgroundColor:COLORS.TOP_BAR.SIGN_IN_BG, fontSize:'16pt'}
        else
            style = undefined
        <NavTab
            name            = 'account'
            label           = 'Sign in'
            label_class     = {nav_class}
            icon            = 'sign-in'
            inner_style     = {padding: '10px', display: 'flex'}
            on_click        = {@sign_in_tab_clicked}
            actions         = {@actions('page')}
            active_top_tab  = {@props.active_top_tab}
            style           = {style}
            add_inner_style = {color: 'black'}
            show_label     = {@state.show_label}
        />

    render_support: ->
        if not require('./customize').commercial
            return
        <NavTab
            label          = {'Help'}
            label_class    = {nav_class}
            icon           = {'medkit'}
            inner_style    = {padding: '10px', display: 'flex'}
            actions        = {@actions('page')}
            active_top_tab = {@props.active_top_tab}
            on_click       = {=>redux.getActions('support').show(true)}
            show_label     = {@state.show_label}
        />

    render_bell: ->
        if not @props.is_logged_in or @props.is_anonymous
            return
        <NotificationBell
            count  = {@props.notify_count}
            active = {@props.show_file_use} />

    render_right_nav: ->
        logged_in = @props.is_logged_in
        <Nav id='smc-right-tabs-fixed' style={height:"#{NAV_HEIGHT}px", lineHeight:'20px', margin:'0', overflowY:'hidden'}>
            {@render_admin_tab() if logged_in and @props.groups?.includes('admin')}
            {@render_sign_in_tab() if not logged_in}
            <NavTab
                name           = {'about'}
                label          = {@props.site_name}
                label_class    = {nav_class}
                icon           = {'info-circle'}
                inner_style    = {padding: '10px', display: 'flex'}
                actions        = {@actions('page')}
                active_top_tab = {@props.active_top_tab}
                show_label     = {@state.show_label}
            />
            <NavItem className='divider-vertical hidden-xs' />
            {@render_support()}
            {@render_account_tab() if logged_in}
            {@render_bell()}
            {<ConnectionIndicator actions={@actions('page')}/> if not @props.is_anonymous}
        </Nav>

    render_project_nav_button: ->
        projects_styles =
            whiteSpace : 'nowrap'
            float      : 'right'
            padding    : '10px 7px'

        <Nav style={height:"#{NAV_HEIGHT}px", margin:'0', overflow:'hidden'}>
            <NavTab
                name           = {'projects'}
                inner_style    = {padding:'0px'}
                actions        = {@actions('page')}
                active_top_tab = {@props.active_top_tab}

            >
                {<div style={projects_styles} cocalc-test="project-button" className={nav_class}>
                    Projects
                </div> if @state.show_label and not @props.is_anonymous}
                <AppLogo />
            </NavTab>
        </Nav>

    # register a default drag and drop handler, that prevents accidental file drops
    # TEST: make sure that usual drag'n'drop activities like rearranging tabs and reordering tasks work
    drop: (e) ->
        if DEBUG
            e.persist()
            #console.log "react desktop_app.drop", e
        e.preventDefault()
        e.stopPropagation()
        if e.dataTransfer.files.length > 0
            {alert_message} = require('./alerts')
            alert_message
                type     : 'info'
                title    : 'File Drop Rejected'
                message  : 'To upload a file, drop it onto the files listing or the "Drop files to upload" area in the +New tab.'

    render: ->
        style =
            display       : 'flex'
            flexDirection : 'column'
            height        : '100vh'
            width         : '100vw'
            overflow      : 'hidden'
            background    : 'white'

        if @props.doing_anonymous_setup
            # Don't show the login screen or top navbar for a second while creating
            # their anonymous account, since that would just be ugly/confusing/and annoying.
            # Have to use above style to *hide* the crash warning.
            return <div style={style}><h1 style={margin:'auto', color:'#666'}><Loading/></h1></div>

        top = if @props.show_global_info then "#{announce_bar_offset}px" else 0

        style_top_bar =
            display       : 'flex'
            marginBottom  : 0
            width         : '100%'
            minHeight     : "#{NAV_HEIGHT}px"
            position      : 'fixed'
            right         : 0
            zIndex        : '100'
            borderRadius  : 0
            top           : top

        positionHackOffset = if @props.show_global_info then announce_bar_offset else 0
        positionHackHeight = (NAV_HEIGHT + positionHackOffset) + 'px'

        <div ref="page" style={style} onDragOver={(e) -> e.preventDefault()} onDrop={@drop}>
            {<FileUsePageWrapper /> if @props.show_file_use}
            {<ConnectionInfo ping={@props.ping} status={@props.connection_status} avgping={@props.avgping} actions={@actions('page')} show_pingtime = {@state.show_label}/> if @props.show_connection}
            {<Support actions={@actions('support')} /> if @props.show}
            {<VersionWarning new_version={@props.new_version} /> if @props.new_version?}
            {<CookieWarning /> if @props.cookie_warning}
            {<LocalStorageWarning /> if @props.local_storage_warning}
            {<GlobalInformationMessage /> if @props.show_global_info}
            {<Navbar className="smc-top-bar" style={style_top_bar}>
                {@render_project_nav_button() if @props.is_logged_in and not @props.is_anonymous}
                <ProjectsNav dropdown={false} />
                {@render_right_nav()}
            </Navbar> if not @props.fullscreen}
            {<div className="smc-sticky-position-hack" style={minHeight:positionHackHeight}> </div> if not @props.fullscreen}
            {<FullscreenButton /> if (@props.fullscreen != 'kiosk' and not @props.is_anonymous)}
            {### Children must define their own padding from navbar and screen borders ###}
            {### Note that the parent is a flex container ###}
            <ErrorBoundary>
                <ActiveAppContent active_top_tab={@props.active_top_tab} open_projects={@props.open_projects} kiosk_mode={@props.fullscreen == 'kiosk'} />
            </ErrorBoundary>
        </div>

page =
    <Redux redux={redux}>
        <ErrorBoundary>
            <Page redux={redux}/>
        </ErrorBoundary>
    </Redux>

exports.render = () => ReactDOM.render(page, document.getElementById('smc-react-container'))