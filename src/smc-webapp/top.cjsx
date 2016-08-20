{React, ReactDOM, rclass, redux, rtypes, Redux, Actions, Store} = require('./smc-react')
{Alert, Button, ButtonToolbar, ButtonGroup, Input, Row, Col,
    Panel, Popover, Tabs, Tab, Tip, Well, Navbar, Nav, NavItem, Modal} = require('react-bootstrap')
{Loading, Icon, Tip} = require('./r_misc')
{HelpPage} = require('./r_help')
{ProjectsPage} = require('./projects')
{ProjectPage} = require('./project_page')
{AccountPageRedux} = require('./account_page')
{FileUsePage} = require('./file_use')
{SupportRedux} = require('./support')
misc = require('smc-util/misc')
{salvus_client} = require('./salvus_client')
{alert_message} = require('./alerts')

# Makes some things work. Like the save button
require('./jquery_plugins')

###
# Page Redux
###

class PageActions extends Actions
    set_active_tab : (key) ->
        @setState(active_top_tab : key)

    show_connection : (shown) ->
        @setState(show_connection : shown)


    set_ping : (ping, avgping) ->
        @setState(ping : ping, avgping : avgping)

    set_connection_status : (val, time) ->
        if val != 'connecting' or time - (redux.getStore('page').get('last_status_time') ? 0) > 0
            @setState(connection_status : val, last_status_time : time)

    set_new_version : (version) ->
        @setState(new_version : version)

redux.createActions('page', PageActions)

# Todo: Save entire state to database for #450, saved workspaces
class PageStore extends Store
    todo : ->
        'place holder'

init_store =
    active_top_tab : 'account' # One of: projects, account, about, [project id]

redux.createStore('page', PageStore, init_store)

recent_disconnects = []
record_disconnect = () ->
    recent_disconnects.push(+new Date())
    # avoid buffer overflow
    recent_disconnects = recent_disconnects[-100..]

num_recent_disconnects = (minutes=10) ->
    # note the "+", since we work with timestamps
    ago = +misc.minutes_ago(minutes)
    return (x for x in recent_disconnects when x > ago).length

reconnection_warning = null

salvus_client.on "ping", (ping_time) ->
    ping_time_smooth = redux.getStore('page').get('avgping') ? ping_time
    # reset outside 3x
    if ping_time > 3 * ping_time_smooth or ping_time_smooth > 3 * ping_time
        ping_time_smooth = ping_time
    else
        decay = 1 - Math.exp(-1)
        ping_time_smooth = decay * ping_time_smooth + (1-decay) * ping_time
    redux.getActions('page').set_ping(ping_time, ping_time_smooth)

salvus_client.on "connected", () ->
    redux.getActions('page').set_connection_status('connected', new Date())

salvus_client.on "disconnected", (state) ->
    record_disconnect()
    redux.getActions('page').set_connection_status('disconnected', new Date())
    redux.getActions('page').set_ping(undefined, undefined)

salvus_client.on "connecting", () ->
    date = new Date()
    f = ->
        redux.getActions('page').set_connection_status('connecting', date)
    window.setTimeout(f, 2000)
    attempt = salvus_client._num_attempts ? 1
    reconnect = (msg) ->
        # reset recent disconnects, and hope that after the reconnection the situation will be better
        recent_disconnects = []
        reconnection_warning = +new Date()
        console.log("ALERT: connection unstable, notification + attempting to fix it -- #{attempt} attempts and #{num_recent_disconnects()} disconnects")
        alert_message(msg)
        salvus_client._fix_connection(true)
        # remove one extra reconnect added by the call above
        setTimeout((-> recent_disconnects.pop()), 500)

    console.log "attempt: #{attempt} and num_recent_disconnects: #{num_recent_disconnects()}"
    if num_recent_disconnects() >= 2 or (attempt >= 10)
        # this event fires several times, limit displaying the message and calling reconnect() too often
        if (reconnection_warning == null) or (reconnection_warning < (+misc.minutes_ago(1)))
            if num_recent_disconnects() >= 5 or attempt >= 20
                reconnect
                    type: "error"
                    timeout: 10
                    message: "Your internet connection is unstable/down or SMC is temporarily not available. Therefore SMC is not working."
            else if attempt >= 10
                reconnect
                    type: "info"
                    timeout: 10
                    message: "Your internet connection could be weak or the SMC service is temporarily unstable. Proceed with caution."
    else
        reconnection_warning = null

salvus_client.on 'new_version', (ver) ->
    redux.getActions('page').set_new_version(ver)

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
        on_close : rtypes.func
        active_top_tab : rtypes.string
        actions : rtypes.object

    make_icon : ->
        if typeof(@props.icon) == 'string'
            <Icon
                name={@props.icon}
                style={fontSize: 20, paddingRight: 2} />
        else if @props.icon?
            @props.icon

    on_click : (e) ->
        if @props.name?
            @props.actions.set_active_tab(@props.name)
        @props.on_click?()

    render : ->
        <NavItem
            active = {@props.active_top_tab == @props.name}
            onClick = {@on_click}
            style = {fontSize: '14px', cursor: 'pointer'}>
            {@make_icon()}
            {<span style={marginLeft: 5}>{@props.label}</span> if @props.label?}
            {@props.children}
        </NavItem>

NotificationBell = rclass
    displayName: 'NotificationBell'

    propTypes :
        count : rtypes.number

    notification_count : ->
        count_styles =
            fontSize : '8pt'
            color : 'red'
            position : 'absolute'
            left : 23
            top : 16
            fontWeight : 700
            background : 'transparent'
        if @props.count > 0
            <span style={count_styles}>{@props.count}</span>

    render : ->
        styles =
            position : 'relative'
            fontSize : '17pt'
            color : '#666'
            cursor : 'pointer'
            marginRight : 6

        <NavItem style={styles}>
            <Icon name='bell-o' />
            {@notification_count()}
        </NavItem>

ConnectionIndicator = rclass
    displayName : 'ConnectionIndicator'

    reduxProps :
        page :
            avgping : rtypes.number
            connection_status : rtypes.string

    propTypes :
        ping : rtypes.number
        status : rtypes.string
        actions : rtypes.object

    connection_status : ->
        if @props.connection_status == 'connected'
            <span>
                <span><Icon name='wifi' style={marginRight: 8, fontSize: '13pt', display: 'inline'} /></span>
                {<Tip title='Most recently recorded roundtrip time to message the server.'>
                    {Math.floor(@props.avgping)}ms
                </Tip> if @props.avgping?}
            </span>
        else if @props.connection_status == 'connecting'
            <span style={backgroundColor : '#FFA500', color : 'white', padding : '1ex', 'zIndex': 100001}>
                connecting...
            </span>
        else if @props.connection_status == 'disconnected'
            <span style={backgroundColor : 'darkred', color : 'white', padding : '1ex', 'zIndex': 100001}>
                disconnected
            </span>

    connection_click : ->
        @props.actions.show_connection(true)

    render : ->
        styles =
            width : '6.5em'
            color : '#666'
            fontSize : '10pt'
            lineHeight : '10pt'
            cursor : 'default'
            marginTop : '0.5ex'
            marginRight : '2ex'
        <NavItem style={styles} onClick={@connection_click}>
            {@connection_status()}
        </NavItem>

ConnectionInfo = rclass
    displayName : 'ConnectionInfo'

    propTypes :
        actions : rtypes.object
        hub : rtypes.string
        ping : rtypes.number
        avgping : rtypes.number
        status : rtypes.string

    reduxProps :
        account :
            hub : rtypes.string

    close : ->
        @props.actions.show_connection(false)

    connection_body : ->
        if @props.hub?
            <div>
                {<Row>
                    <Col sm=3>
                        <h4>Ping Time</h4>
                    </Col>
                    <Col sm=5>
                        <pre>{@props.avgping}ms (latest: {@props.ping}ms)</pre>
                    </Col>
                </Row> if @props.ping}
                <Row>
                    <Col sm=3>
                        <h4>Hub Server</h4>
                    </Col>
                    <Col sm=5>
                        <pre>{@props.hub}</pre>
                    </Col>
                    <Col sm=3 smOffset=1>
                        <Button bsStyle='warning' onClick={=>salvus_client._fix_connection(true)}>
                            <Icon name='repeat' spin={@props.status == 'connecting'} /> Reconnect
                        </Button>
                    </Col>
                </Row>
            </div>
        else
            <div>
                Not connected to a hub.
            </div>

    render : ->
        <Modal show={true} onHide={@close} animation={false}>
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

SMCLogo = rclass
    displayName : 'SMCLogo'

    render : ->
        smc_icon_url = require('salvus-icon.svg')
        styles =
            display : 'inline-block'
            backgroundImage : "url('#{smc_icon_url}')"
            backgroundSize : 'contain'
            backgroundColor : require('./r_misc').SAGE_LOGO_COLOR
            height : 42
            width : 42
            marginTop : -15
            marginLeft: -6
            marginBottom: -16
            marginRight : 8
            position: 'relative'
        <div className='img-rounded' style={styles}></div>

VersionWarning = rclass
    displayName : 'VersionWarning'

    propTypes :
        new_version : rtypes.object

    render_critical : ->
        if @props.new_version.min_version > salvus_client.version()
            <div>
                <br />
                THIS IS A CRITICAL UPDATE. YOU MUST&nbsp;
                <a onClick={=>window.location.reload()} style={color: 'white', fontWeight: 'bold', textDecoration: 'underline'}>
                    RELOAD THIS PAGE
                </a>
                &nbsp;IMMEDIATELY OR YOU WILL BE DISCONNECTED.  Sorry for the inconvenience.
            </div>

    render_close : ->
        if not (@props.new_version.min_version > salvus_client.version())
            <Icon
                name = 'times'
                className = 'pull-right'
                style = {cursor : 'pointer'}
                onClick = {=>redux.getActions('page').set_new_version(undefined)} />

    render : ->
        styles =
            position : 'fixed'
            left : 12
            backgroundColor : 'red'
            color : '#fff'
            top : 20
            opacity : .75
            borderRadius : 4
            padding : 5
            zIndex : 1
            boxShadow : '8px 8px 4px #888'
            width : '70%'
            marginTop : '1em'
        <div style={styles}>
            <Icon name='refresh' /> New Version Available: upgrade by clicking on&nbsp;
            <a onClick={=>window.location.reload()} style={color: 'white', fontWeight: 'bold', textDecoration: 'underline'}>
                reload this page
            </a>.
            {@render_close()}
            {@render_critical()}
        </div>
Page = rclass
    displayName : "Page"

    reduxProps :
        projects :
            open_projects  : rtypes.immutable # Map of open projects and their state
            project_map    : rtypes.immutable # All projects available to the user
            public_project_titles : rtypes.immutable
        page :
            active_top_tab : rtypes.string    # key of the active tab
            show_connection : rtypes.bool
            ping : rtypes.number
            avgping : rtypes.number
            connection_status : rtypes.string
            new_version : rtypes.object
        account :
            first_name : rtypes.string
            last_name : rtypes.string
            is_logged_in : rtypes.func
        support :
            show : rtypes.bool

    propTypes :
        redux : rtypes.object
        page_actions : rtypes.object

    close_project : (e, project_id) ->
        e.stopPropagation()
        e.preventDefault()
        if project_id == @props.active_top_tab
            index = @props.open_projects.indexOf(project_id)
            size = @props.open_projects.size
            next_active_tab = 'projects'
            if index == -1 or size <= 1
                next_active_tab = 'projects'
            else if index == size - 1
                next_active_tab = @props.open_projects.get(index - 1)
            else
                next_active_tab = @props.open_projects.get(index + 1)
            redux.getActions('page').set_active_tab(next_active_tab)
        redux.getActions('projects').set_project_closed(project_id)

    project_tabs : ->
        v = []
        if not @props.open_projects?
            return
        @props.open_projects.map (project_id, index) =>
            v.push(@project_tab(project_id))
        return v

    project_tab: (project_id) ->
        title = @props.project_map?.getIn([project_id, 'title'])
        if not title?
            title = @props.public_project_titles?.get(project_id)
            if not title?
                # Ensure that at some point we'll have the title if possible (e.g., if public)
                redux.getActions('projects').fetch_public_project_title(project_id)
                return <Loading key={project_id} />
        desc = misc.trunc(@props.project_map?.getIn([project_id, 'description']) ? '', 128)
        project_state = @props.project_map?.getIn([project_id, 'state', 'state'])
        icon = require('smc-util/schema').COMPUTE_STATES[project_state]?.icon ? 'bullhorn'
        <NavTab name={project_id} key={project_id} actions={@props.page_actions} active_top_tab={@props.active_top_tab}>
            <Icon
                name = 'times'
                className = 'pull-right'
                onClick = {(e)=>@close_project(e, project_id)} />
            <Tip title={misc.trunc(title,32)} tip={desc} placement='bottom' size='small'>
                <Icon name={icon} style={fontSize:'20px'} />
                <span style={marginLeft: "5px"}>{misc.trunc(title, 32)}</span>
            </Tip>
        </NavTab>

    account_name : ->
        name = ''
        if @props.first_name? and @props.last_name?
            name = misc.trunc_middle(@props.first_name + ' ' + @props.last_name, 32)
        if not name.trim()
            name = "Account"
        return name

    render_page : ->
        switch @props.active_top_tab
            when 'projects'
                return <ProjectsPage />
            when 'account'
                return <AccountPageRedux />
            when 'about'
                return <HelpPage />
            when 'help'
                return <div>To be implemented</div>
            when undefined
                return
            else
                return <ProjectPage project_id={@props.active_top_tab} />

    render : ->
        window.props = @props   # TODO: FOR DEBUGGING ONLY
        <div>
            {<SupportRedux /> if @props.show}
            {<ConnectionInfo ping={@props.ping} status={@props.connection_status} avgping={@props.avgping} actions={@props.page_actions} /> if @props.show_connection}
            {<VersionWarning new_version={@props.new_version} /> if @props.new_version?}
            <Navbar style={marginBottom: 0}>
                <Nav pullRight>
                    <NavTab name='account' label={@account_name()} icon='cog' actions={@props.page_actions} active_top_tab={@props.active_top_tab} />
                    <NavTab name='about' label='About' icon='question-circle' actions={@props.page_actions} active_top_tab={@props.active_top_tab} />
                    <NavTab label='Help' icon='medkit' actions={@props.page_actions} active_top_tab={@props.active_top_tab} on_click={=>redux.getActions('support').show(true)}/>
                    {<NotificationBell count={@props.notification_count} /> if @props.is_logged_in()}
                    <ConnectionIndicator actions={@props.page_actions} />
                </Nav>
                {<Nav>
                    <NavTab name='projects' label="Projects" icon={<SMCLogo />} actions={@props.page_actions} active_top_tab={@props.active_top_tab} />
                </Nav> if @props.is_logged_in()}
                <Nav>
                    {@project_tabs()}
                </Nav>
            </Navbar>
            {@render_page()}
        </div>

$('body').css('padding-top':0).append('<div class="page-container smc-react-container"></div>')
page = <Redux redux={redux}>
    <Page redux={redux} page_actions={redux.getActions('page')} notification_count=1 />
</Redux>
ReactDOM.render(page, $(".smc-react-container")[0])
