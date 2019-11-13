##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016 -- 2017, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

{isMobile} = require('./feature')

{React, ReactDOM, rclass, redux, rtypes, Redux, redux_fields} = require('./app-framework')

{Navbar, Nav, NavItem} = require('react-bootstrap')
{ErrorBoundary, Loading, Tip}   = require('./r_misc')
{COLORS} = require('smc-util/theme')

# CoCalc Pages
# SMELL: Page UI's are mixed with their store/state.
# So we have to require them even though they aren't used
{HelpPage}     = require('./r_help')
{ProjectsPage} = require('./projects')
{ProjectPage}  = require('./project_page')
{AccountPage}  = require('./account_page') # SMELL: Not used but gets around a webpack error..
{FileUsePage}  = require('./file-use/page')
{Support}      = require('./support')
{Avatar}       = require('./other-users')

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
    support :
        show                   : rtypes.bool

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
        if @props.account_id
            a = <Avatar
                    size       = {20}
                    account_id = {@props.account_id}
                    no_tooltip = {true}
                    no_loading = {true}
                    />
        else
            a = 'cog'

        <NavTab
            name           = 'account'
            label          = {'Account'}
            label_class    = {nav_class}
            icon           = {a}
            actions        = {@actions('page')}
            active_top_tab = {@props.active_top_tab}
            show_label     = {@state.show_label}
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
        if not @props.is_logged_in
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
                label          = {'CoCalc'}
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
            <ConnectionIndicator actions={@actions('page')} />
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
                </div> if @state.show_label}
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
                {@render_project_nav_button() if @props.is_logged_in}
                <ProjectsNav dropdown={false} />
                {@render_right_nav()}
            </Navbar> if not @props.fullscreen}
            {<div className="smc-sticky-position-hack" style={minHeight:positionHackHeight}> </div> if not @props.fullscreen}
            {<FullscreenButton /> if (@props.fullscreen != 'kiosk')}
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