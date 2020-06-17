#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

{React, ReactDOM, rclass, redux, rtypes, Redux, Actions, Store} = require('./app-framework')
{Button, Col, Row, Modal, NavItem} = require('react-bootstrap')
{Icon, Space, Tip} = require('./r_misc')
{COLORS} = require('smc-util/theme')
{webapp_client} = require('./webapp_client')
misc = require('smc-util/misc')

{InfoPage} = require('./info/info')
{ProjectsPage} = require('./projects/projects-page')
{ProjectPage, MobileProjectPage} = require('./project_page')
{AccountPage} = require('./account/account-page')
{FileUsePage} = require('./file-use/page')
{NotificationPage} = require('./notifications')
{AdminPage} = require('./admin')
{show_announce_end} = require('./account')
{user_tracking} = require('./user-tracking')
{KioskModeBanner} = require('./app/kiosk-mode-banner')
{Connecting} = require('./landing-page/connecting')

ACTIVE_BG_COLOR = COLORS.TOP_BAR.ACTIVE
feature = require('./feature')

# same as nav bar height?
exports.announce_bar_offset = announce_bar_offset = 40

exports.ActiveAppContent = ({active_top_tab, render_small, open_projects, kiosk_mode}) ->
    v = []
    if open_projects?
        open_projects.forEach (project_id) ->
            is_active = project_id == active_top_tab
            project_name = redux.getProjectStore(project_id).name
            if render_small
                x = <MobileProjectPage name={project_name} project_id={project_id} is_active={is_active} />
            else
                x = <ProjectPage name={project_name} project_id={project_id} is_active={is_active} />
            cls = 'smc-vfill'
            if project_id != active_top_tab
                cls += ' hide'
            v.push(<div key={project_id} className={cls}>{x}</div>)
    else  # open_projects not used (e.g., on mobile).
        if active_top_tab?.length == 36
            project_id = active_top_tab
            project_name = redux.getProjectStore(project_id).name
            if render_small
                x = <MobileProjectPage key={project_id} name={project_name} project_id={project_id} is_active={true} />
            else
                x = <ProjectPage key={project_id} name={project_name} project_id={project_id} is_active={true} />
            v.push(x)

    # in kiosk mode: if no file is opened show a banner
    if kiosk_mode and v.length == 0
        v.push <KioskModeBanner key={'kiosk'} />
    else
        switch active_top_tab
            when 'projects'
                v.push <ProjectsPage key={'projects'}/>
            when 'account'
                v.push <AccountPage key={'account'}/>
            when 'help', 'about'
                v.push <InfoPage key={'about'}/>
            when 'file-use'
                v.push <FileUsePage redux={redux} key={'file-use'}/>
            when 'notifications'
                v.push <NotificationPage key={'notifications'} />
            when 'admin'
                v.push <AdminPage redux={redux} key={'admin'}/>
            when undefined
                v.push <div key={'broken'}>Please click a button on the top tab.</div>

    if v.length == 0
        # this happens upon loading a URL for a project, but the project isn't open yet.
        # implicitly, this waits for a websocket connection, hence show the same banner as for the landing page
        v.push <Connecting key={'connecting'} />
    return v

exports.NavTab = rclass
    displayName : "NavTab"

    propTypes :
        name            : rtypes.string
        label           : rtypes.oneOfType([rtypes.string,rtypes.element])
        label_class     : rtypes.string
        icon            : rtypes.oneOfType([rtypes.string,rtypes.element])
        close           : rtypes.bool
        on_click        : rtypes.func
        active_top_tab  : rtypes.string
        actions         : rtypes.object
        style           : rtypes.object
        inner_style     : rtypes.object
        add_inner_style : rtypes.object
        show_label      : rtypes.bool
        is_project      : rtypes.bool

    getDefaultProps: ->
        show_label : true
        is_project : false

    shouldComponentUpdate: (next) ->
        if @props.children?
            return true
        return misc.is_different(@props, next, ['label', 'label_class', 'icon', 'close', 'active_top_tab', 'show_label'])

    render_label: ->
        if @props.show_label and @props.label?
            <span style={marginLeft: 5} className={@props.label_class} cocalc-test={@props.name}>
                {@props.label}
            </span>

    render_icon: ->
        if @props.icon?
            if typeof @props.icon == "string"
                <Icon
                    name  = {@props.icon}
                    style = {paddingRight: 2}
                />
            else
                @props.icon

    on_click: (e) ->
        @props.on_click?()

        if @props.is_project
            user_tracking('top_nav', {name:'project', project_id:@props.name})
        else
            user_tracking('top_nav', {name:@props.name ? @props.label})

        if @props.name?
            @actions('page').set_active_tab(@props.name)

    render: ->
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
            outer_style.backgroundColor = ACTIVE_BG_COLOR

        if @props.inner_style
            inner_style = @props.inner_style
        else
            inner_style =
                padding : '10px'
        if @props.add_inner_style
            misc.merge(inner_style, @props.add_inner_style)

        <NavItem
            active = {is_active}
            onClick = {@on_click}
            style = {outer_style}
        >
            <div style={inner_style}>
                {@render_icon()}
                {@render_label()}
                {@props.children}
            </div>
        </NavItem>


exports.NotificationBell = require('./app/notification-bell').NotificationBell
exports.ConnectionIndicator = require('./app/connection-indicator').ConnectionIndicator
exports.ConnectionInfo = require('./app/connection-info').ConnectionInfo

exports.FullscreenButton = rclass
    displayName : 'FullscreenButton'

    reduxProps :
        page :
            fullscreen             : rtypes.oneOf(['default', 'kiosk'])

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['fullscreen'])

    on_fullscreen: (ev) ->
        @actions('page').toggle_fullscreen()
        user_tracking("top_nav", {name:'fullscreen', enabled:!@props.fullscreen})


    render_floating: ->
        icon = 'compress'
        tip_style =
            position     : 'fixed'
            zIndex       : 10000
            right        : '0px'
            top          : "0px"
            textAlign    : 'center'
            background   : '#fff'
            width        : "15pt"
            height       : "15pt"

        icon_style =
            fontSize   : '13pt'
            padding    : 2
            color      : COLORS.GRAY
            cursor     : 'pointer'
            background : '#fff'
            opacity    : .7
            borderBottomLeftRadius: '3px'
            border     : '1px solid grey'

        <Tip
            style     = {tip_style}
            title     = {'Fullscreen mode enabled. Click to disable and reveal controls.'}
            placement = {'left'}
        >
            <Icon
                style   = {icon_style}
                name    = {icon}
                onClick = {@on_fullscreen}
            />
        </Tip>

    render_menu: ->
        icon  = 'expand'

        tip_style =
            display    : 'block'
            fontSize   : '15pt'
            padding    : '10px'

        outer_style =
            position    : 'relative'
            float       : 'left'

        icon_style =
            color      : COLORS.GRAY
            cursor     : 'pointer'

        <NavItem
            ref = {'fullscreen'}
            style = {outer_style}
            onClick = {@on_fullscreen}
        >
            <Tip
                style     = {tip_style}
                title     = {'Fullscreen mode, focused on the current document or page.'}
                placement = {'left'}
            >
                <Icon
                    style   = {icon_style}
                    name    = {icon}
                />
            </Tip>
        </NavItem>

    render: ->
        # kiosk mode is stuck in fullscreen
        return null if @props.fullscreen == 'kiosk'

        if @props.fullscreen
            @render_floating()
        else
            @render_menu()

exports.MentionsButton = rclass
    displayName : 'MentionsButton'

    propTypes :
        active_top_tab  : rtypes.string

    reduxProps :
        mentions:
            mentions: rtypes.immutable.Map,
            get_unseen_size: rtypes.func

    render: ->
        is_active = @props.active_top_tab == 'notifications'

        icon  = 'fas fa-at'

        tip_style =
            display    : 'block'
            fontSize   : '15pt'
            padding    : '10px'

        outer_style =
            position    : 'relative'
            float       : 'left'

        icon_style =
            color      : COLORS.GRAY
            cursor     : 'pointer'

        # copied from smc-webapp/file-use/viewer.tsx
        if this.props.get_unseen_size(this.props.mentions) > 0
            icon_style.color = COLOR.FG_RED

        if is_active
            outer_style.backgroundColor = ACTIVE_BG_COLOR

        <NavItem
            ref = {'fullscreen'}
            style = {outer_style}
            onClick = {=>@actions("page").show_mentions()}
        >
            <Tip
                style     = {tip_style}
                title     = {'Show where you were mentioned.'}
                placement = {'bottom'}
            >
                <Icon
                    style   = {icon_style}
                    name    = {icon}
                />
            </Tip>
        </NavItem>



exports.AppLogo = rclass
    displayName : 'AppLogo'

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['logo_square'])

    reduxProps:
        customize:
            logo_square : rtypes.string

    url: ->
        if @props.logo_square?.length > 0
            return @props.logo_square
        else
            {APP_ICON} = require('./art')
            return APP_ICON

    render: ->
        styles =
            display         : 'inline-block'
            backgroundImage : "url('#{@url()}')"
            backgroundSize  : 'contain'
            backgroundRepeat: 'no-repeat'
            height          : "32px"
            width           : "32px"
            position        : 'relative'
            margin          : '2px'
        <div style={styles}></div>

exports.VersionWarning = rclass
    displayName : 'VersionWarning'

    propTypes :
        new_version : rtypes.immutable.Map

    shouldComponentUpdate: (props) ->
        return @props.new_version != props.new_version

    render_critical: ->
        if @props.new_version.get('min_version') > webapp_client.version()
            <div>
                <br />
                THIS IS A CRITICAL UPDATE. YOU MUST <Space/>
                <a onClick={=>window.location.reload()} style={cursor:'pointer', color: 'white', fontWeight: 'bold', textDecoration: 'underline'}>
                    RELOAD THIS PAGE
                </a>
                <Space/> IMMEDIATELY OR YOU WILL BE DISCONNECTED.  Sorry for the inconvenience.
            </div>

    render_close: ->
        if not (@props.new_version.get('min_version') > webapp_client.version())
            <Icon
                name = 'times'
                className = 'pull-right'
                style = {cursor : 'pointer'}
                onClick = {=>redux.getActions('page').set_new_version(undefined)} />

    render: ->
        styles =
            fontSize        : '12pt'
            position        : 'fixed'
            left            : 12
            backgroundColor : '#fcf8e3'
            color           : '#8a6d3b'
            top             : 20
            borderRadius    : 4
            padding         : '15px'
            zIndex          : 900
            boxShadow       : '8px 8px 4px #888'
            width           : '70%'
            marginTop       : '1em'
        if @props.new_version.get('min_version') > webapp_client.version()
            styles.backgroundColor = 'red'
            styles.color           = '#fff'

        <div style={styles}>
            <Icon name={'refresh'} /> New Version Available: upgrade by  <Space/>
            <a onClick={=>window.location.reload()} style={cursor:'pointer', fontWeight: 'bold', color:styles.color, textDecoration: 'underline'}>
                reloading this page
            </a>.
            {@render_close()}
            {@render_critical()}
        </div>

warning_styles =
    position        : 'fixed'
    left            : 12
    backgroundColor : 'red'
    color           : '#fff'
    top             : 20
    opacity         : .9
    borderRadius    : 4
    padding         : 5
    marginTop       : '1em'
    zIndex          : 100000
    boxShadow       : '8px 8px 4px #888'
    width           : '70%'

exports.CookieWarning = rclass
    displayName : 'CookieWarning'

    render: ->
        <div style={warning_styles}>
            <Icon name='warning' /> You <em>must</em> enable cookies to sign into CoCalc.
        </div>

misc = require('smc-util/misc')
storage_warning_style = misc.copy(warning_styles)
storage_warning_style.top = 55

exports.LocalStorageWarning = rclass
    displayName : 'LocalStorageWarning'

    render: ->
        <div style={storage_warning_style}>
            <Icon name='warning' /> You <em>must</em> enable local storage to use this website{' (on Safari you must disable private browsing mode)' if feature.get_browser() == 'safari'}.
        </div>
