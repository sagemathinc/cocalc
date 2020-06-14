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
{analytics_event} = require('./tracker')
{user_tracking} = require('./user-tracking')
{KioskModeBanner} = require('./app_shared2')
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
            if @props.is_project
                analytics_event('top_nav', 'opened_a_project');
            else
                analytics_event('top_nav', @props.name)
        else if @props.label?
            analytics_event('top_nav', @props.label)

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

exports.ConnectionIndicator = rclass
    displayName : 'ConnectionIndicator'

    propTypes :
        actions       : rtypes.object
        status        : rtypes.string
        on_click      : rtypes.func

    reduxProps :
        page :
            connection_status : rtypes.string
        account :
            mesg_info         : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['connection_status', 'status', 'mesg_info'])

    render_connection_status: ->
        if @props.connection_status == 'connected'
            icon_style = {marginRight: '16px', fontSize: '13pt', display: 'inline'}
            if (@props.mesg_info?.get('enqueued') ? 0) > 5  # serious backlog of data!
                icon_style.color = 'red'
            else if (@props.mesg_info?.get('count') ? 0) > 1 # worrisome amount
                icon_style.color = '#08e'
            else if (@props.mesg_info?.get('count') ? 0) > 0 # working well but doing something minimal
                icon_style.color = '#00c'
            else
                icon_style.color = 'grey'
            <div style={padding:'9px'}>
                <Icon name='wifi' style={icon_style}/>
            </div>
        else if @props.connection_status == 'connecting'
            <div style={backgroundColor : '#FFA500', color : 'white', padding : '1ex', overflow:'hidden'}>
                connecting...
            </div>
        else if @props.connection_status == 'disconnected'
            <div style={backgroundColor : '#FFA500', color : 'white', padding : '1ex', overflow:'hidden'}>
                disconnected
            </div>

    connection_click: ->
        @props.actions.show_connection(true)
        @props.on_click?()
        document.activeElement.blur() # otherwise, it'll be highlighted even when closed again
        user_tracking("top_nav", {name:"connection"})

    render: ->
        outer_styles =
            color      : '#666'
            fontSize   : '10pt'
            lineHeight : '10pt'
            cursor     : 'pointer'
            float      : 'left'
        inner_styles =
            paddingTop : '3px'

        <NavItem style={outer_styles} onClick={@connection_click}>
            <div style={inner_styles} >
                {@render_connection_status()}
            </div>
        </NavItem>

bytes_to_str = (bytes) ->
    x = Math.round(bytes / 1000)
    if x < 1000
        return x + "K"
    return x/1000 + "M"


MessageInfo = rclass
    propTypes :
        info : rtypes.immutable.Map

    render: ->
        if not @props.info?
            return <span></span>
        if @props.info.get('count') > 0
            flight_style = {color:'#08e', fontWeight:'bold'}
        <div>
            <pre>
                {@props.info.get('sent')} messages sent ({bytes_to_str(@props.info.get('sent_length'))})
                <br/>
                {@props.info.get('recv')} messages received ({bytes_to_str(@props.info.get('recv_length'))})
                <br/>
                <span style={flight_style}>{@props.info.get('count')} messages in flight</span>
                <br/>
                {@props.info.get('enqueued')} messages queued to send
            </pre>
            <div style={color:"#666"}>
                Connection icon color changes as the number of messages in flight to a hub increases. Usually, no action is needed, but the counts are helpful for diagnostic purposes.  The maximum number of messages that can be sent at the same time is {@props.info.get('max_concurrent')}.
            </div>
        </div>

exports.ConnectionInfo = rclass
    displayName : 'ConnectionInfo'

    propTypes :
        actions : rtypes.object
        ping    : rtypes.number
        avgping : rtypes.number
        status  : rtypes.string

    reduxProps :
        account :
            hub       : rtypes.string
            mesg_info : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['avgping', 'ping', 'status', 'hub', 'mesg_info'])

    close: ->
        @actions('page').show_connection(false)

    connection_body: ->
        <div>
            {<Row>
                <Col sm={3}>
                    <h4>Ping time</h4>
                </Col>
                <Col sm={6}>
                    <pre>{@props.avgping}ms (latest: {@props.ping}ms)</pre>
                </Col>
            </Row> if @props.ping}
            <Row>
                <Col sm={3}>
                    <h4>Hub server</h4>
                </Col>
                <Col sm={6}>
                    <pre>{if @props.hub? then @props.hub else "Not signed in"}</pre>
                </Col>
                <Col sm={2}>
                    <Button onClick={=>webapp_client.hub_client.fix_connection()}>
                        <Icon name='repeat' spin={@props.status == 'connecting'} /> Reconnect
                    </Button>
                </Col>
            </Row>
            <Row>
                <Col sm={3}>
                    <h4>Messages</h4>
                </Col>
                <Col sm={6}>
                    <MessageInfo info={@props.mesg_info} />
                </Col>
            </Row>
        </div>

    render: ->
        <Modal bsSize={"large"}  show={true} onHide={@close} animation={false}>
            <Modal.Header closeButton>
                <Modal.Title>
                    <Icon name='wifi' style={marginRight: '1em'} /> Connection
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {@connection_body()}
            </Modal.Body>
            <Modal.Footer>
                <Button onClick={@close}>Close</Button>
            </Modal.Footer>
        </Modal>

exports.FullscreenButton = rclass
    displayName : 'FullscreenButton'

    reduxProps :
        page :
            fullscreen : rtypes.oneOf(['default', 'kiosk'])
        account :
            show_global_info       : rtypes.bool

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['fullscreen', 'show_global_info'])

    on_fullscreen: (ev) ->
        user_tracking("top_nav",{name:'fullscreen', enabled:!@props.fullscreen})
        @actions('page').toggle_fullscreen()

    render: ->
        icon = if @props.fullscreen then 'compress' else 'expand'
        top_px = '-1px'

        tip_style =
            position     : 'fixed'
            zIndex       : 10000
            right        : 0
            top          : top_px
            borderRadius : '3px'

        icon_style =
            fontSize   : '13pt'
            padding    : 2
            color      : COLORS.GRAY
            cursor     : 'pointer'

        if @props.fullscreen
            icon_style.background = '#fff'
            icon_style.opacity    = .7
            icon_style.border     = '1px solid grey'

        <Tip
            style     = {tip_style}
            title     = {'Fullscreen mode, focused on the current document or page.'}
            placement = {'left'}
        >
            <Icon
                style   = {icon_style}
                name    = {icon}
                onClick = {@on_fullscreen}
            />
        </Tip>

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

# This is used in the "desktop_app" to show a global announcement on top of CoCalc.
# It was first used for a general CoCalc announcement, but it's general enough to be used later on
# for other global announcements.
# For now, it just has a simple dismiss button backed by the account → other_settings, though.
# 20171013: disabled, see https://github.com/sagemathinc/cocalc/issues/1982
# 20180713: enabled again, we need it to announce the K2 switch
# 20180819: Ubuntu 18.04 project image upgrade
exports.GlobalInformationMessage = rclass
    displayName: 'GlobalInformationMessage'

    dismiss: ->
        redux.getTable('account').set(other_settings:{show_global_info2:webapp_client.server_time()})

    render: ->
        more_url = 'https://github.com/sagemathinc/cocalc/wiki/Ubuntu-18.04-project-image-upgrade'
        local_time = show_announce_end.toLocaleString()
        bgcol = COLORS.YELL_L
        style =
            padding         : '5px 0 5px 5px'
            backgroundColor : bgcol
            fontSize        : '18px'
            position        : 'fixed'
            zIndex          : '101'
            right           : 0
            left            : 0
            height          : '36px'

        <Row style={style}>
            <Col sm={9} style={paddingTop: 3}>
                <p>
                    <b>Global announcement: <a target='_blank' href={more_url}>A major software upgrade for all projects</a> is live.</b>
                </p>
            </Col>
            <Col sm={3}>
                <Button bsStyle='danger' bsSize="small" className='pull-right' style={marginRight:'10px'}
                    onClick={@dismiss}>Close</Button>
            </Col>
        </Row>
