{React, ReactDOM, rclass, redux, rtypes, Redux, Actions, Store} = require('./smc-react')
{Alert, Button, ButtonToolbar, ButtonGroup, Input, Row, Col,
    Panel, Popover, Tabs, Tab, Tip, Well, Navbar, Nav, NavItem, Modal} = require('react-bootstrap')
{Loading, Icon, Tip} = require('./r_misc')
{HelpPage} = require('./r_help')
{ProjectsPage} = require('./projects')
{ProjectPage} = require('./project_page')
{AccountPageRedux} = require('./account_page')
{FileUsePage} = require('./file_use')
{Support} = require('./support')
misc = require('smc-util/misc')
{salvus_client} = require('./salvus_client')
{alert_message} = require('./alerts')
{set_url} = require('./history')
{set_window_title} = require('./browser')

{SortableContainer, SortableElement} = require('react-sortable-hoc')

# Makes some things work. Like the save button
require('./jquery_plugins')

###
# Page Redux
###

class PageActions extends Actions
    # Expects a func which takes a browser keydown event
    # Only allows one keyhandler to be active at a time.
    set_active_key_handler : (handler) =>
        if handler?
            $(window).off("keydown", @active_key_handler)
            @active_key_handler = handler

        if @active_key_handler?
            $(window).on("keydown", @active_key_handler)

    clear_active_key_handler : =>
        $(window).off("keydown", @active_key_handler)

    clear_all_handlers : =>
        $(window).off("keydown", @active_key_handler)

    add_a_ghost_tab : (current_num) =>
        @setState(num_ghost_tabs : current_num + 1)

    clear_ghost_tabs : =>
        @setState(num_ghost_tabs : 0)

    set_active_tab : (key) =>
        @setState(active_top_tab : key)
        switch key
            when 'projects'
                set_url('/projects')
                set_window_title('Projects')
            when 'account'
                redux.getActions('account').push_state()
                set_window_title('Account')
            when 'about'
                set_url('/help')
                set_window_title('Help')
            when undefined
                return
            else
                redux.getProjectActions(key)?.push_state()
                project_map = redux.getStore('projects').get('project_map')
                set_window_title(project_map?.getIn([key, 'title']))

    show_connection : (shown) =>
        @setState(show_connection : shown)

    toggle_show_file_use : =>
        is_shown = redux.getStore('page').get('show_file_use')
        if is_shown
            @set_active_key_handler(undefined)
        else
            @clear_active_key_handler()

        @setState(show_file_use: !is_shown)

    set_ping : (ping, avgping) =>
        @setState(ping : ping, avgping : avgping)

    set_connection_status : (val, time) =>
        if val != 'connecting' or time - (redux.getStore('page').get('last_status_time') ? 0) > 0
            @setState(connection_status : val, last_status_time : time)

    set_new_version : (version) =>
        @setState(new_version : version)

    set_fullscreen : (val) =>
        @setState(fullscreen : val)

    show_cookie_warning : =>
        @setState(cookie_warning : true)

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

CookieWarning = rclass
    displayName : 'CookieWarning'

    render : ->
        styles =
            position : 'fixed'
            left : 12
            backgroundColor : 'red'
            color : '#fff'
            top : 20
            opacity : .6
            borderRadius : 4
            padding : 5
            marginTop : '1em'
            zIndex : 1
            boxShadow : '8px 8px 4px #888'
            width : '70%'
        <div style={styles}>
            <Icon name='warning' /> You <em>must</em> enable cookies to use SageMathCloud.
        </div>

FullscreenButton = rclass
    displayName : 'FullscreenButton'

    reduxProps :
        page :
            fullscreen : rtypes.bool

    on_fullscreen : ->
        @actions('page').set_fullscreen(not @props.fullscreen)

    render : ->
        icon = if @props.fullscreen then 'expand' else 'compress'
        styles =
            position : 'fixed'
            zIndex : 100
            right : 0
            top : 0
            fontSize : '12pt'
            padding : 4
            color : '#999'
            fontWeight : 700
        <Icon style={styles} name={icon} onClick={@on_fullscreen} />

NavTab = rclass
    displayName : "NavTab"

    propTypes :
        label : rtypes.string
        icon : rtypes.oneOfType([rtypes.string, rtypes.object])
        close : rtypes.bool
        on_click : rtypes.func
        active_top_tab : rtypes.string
        actions : rtypes.object
        style : rtypes.object
        inner_style : rtypes.object

    make_icon : ->
        if typeof(@props.icon) == 'string'
            <Icon
                name={@props.icon}
                style={fontSize: 20, paddingRight: 2} />
        else if @props.icon?
            @props.icon

    on_click : (e) ->
        if @props.name?
            @actions('page').set_active_tab(@props.name)
        @props.on_click?()

    render : ->
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
            outer_style.backgroundColor = "#e7e7e7"

        if @props.inner_style
            inner_style = @props.inner_style
        else
            inner_style =
                padding : '10px'

        <NavItem
            active = {is_active}
            onClick = {@on_click}
            style = {outer_style}
        >
            <div style={inner_style}>
                {@make_icon()}
                {<span style={marginLeft: 5}>{@props.label}</span> if @props.label?}
                {@props.children}
            </div>
        </NavItem>

ProjectTab = rclass
    propTypes:
        project_map           : rtypes.object # immutable.Map
        open_projects         : rtypes.object # immutable.Map
        public_project_titles : rtypes.object # immutable.Map
        index                 : rtypes.number
        num_ghost_tabs        : rtypes.number
        project_id            : rtypes.string
        active_top_tab        : rtypes.string

    getInitialState : ->
        x_hovered : false

    close_tab : (e) ->
        e.stopPropagation()
        e.preventDefault()
        index = @props.open_projects.indexOf(@props.project_id)
        size = @props.open_projects.size
        if @props.project_id == @props.active_top_tab
            next_active_tab = 'projects'
            if index == -1 or size <= 1

                next_active_tab = 'projects'
            else if index == size - 1
                next_active_tab = @props.open_projects.get(index - 1)
            else
                next_active_tab = @props.open_projects.get(index + 1)
            @actions('page').set_active_tab(next_active_tab)
        if index == size - 1
            @actions('page').clear_ghost_tabs()
        else
            @actions('page').add_a_ghost_tab(@props.num_ghost_tabs)

        @actions('projects').set_project_closed(@props.project_id)

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

        <SortableNavTab
            index={@props.index}
            name={@props.project_id}
            actions={@actions('page_actions')}
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
        outer_styles =
            width : '6.5em'
            color : '#666'
            fontSize : '10pt'
            lineHeight : '10pt'
            cursor : 'default'
            marginTop : '4px'
            marginRight : '2ex'
            float : 'left'
        inner_styles =
            padding : '10px'

        <NavItem style={outer_styles} onClick={@connection_click}>
            <div style={inner_styles} >
                {@connection_status()}
            </div>
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
            height : 40
            width : 42
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
            open_projects  : rtypes.immutable # List of open projects and their state
            project_map    : rtypes.immutable # All projects available to the user
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
        page_actions : rtypes.object

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
            open_projects  = {@props.open_projects}
            num_ghost_tabs = {@props.num_ghost_tabs}
            public_project_titles = {@props.public_project_titles}
        />

    account_name : ->
        name = ''
        if @props.get_fullname?
            name = misc.trunc_middle(@props.get_fullname(), 32)
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
                project_name = redux.getProjectStore(@props.active_top_tab).name
                <ProjectPage name={project_name} project_id={@props.active_top_tab} />

    render_right_nav : ->
        <Nav id='smc-right-tabs-fixed' style={height:'42px', lineHeight:'20px', margin:'0'}>
            <NavTab
                name='account'
                label={@account_name()}
                icon='cog'
                actions={@props.page_actions}
                active_top_tab={@props.active_top_tab}
            />
            <NavTab name='about' label='About' icon='question-circle' actions={@props.page_actions} active_top_tab={@props.active_top_tab} />
            <NavItem className='divider-vertical hidden-xs' />
            <NavTab label='Help' icon='medkit' actions={@props.page_actions} active_top_tab={@props.active_top_tab} on_click={=>redux.getActions('support').show(true)} />
            {<NotificationBell count={@props.get_notify_count()} /> if @props.is_logged_in()}
            <ConnectionIndicator actions={@props.page_actions} />
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
                actions={@props.page_actions}
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
            '
        shim_style =
            position : 'absolute'
            left : '0'
            marginRight : '0px'
            marginLeft : '0px'
            paddingLeft : '0px'
            width : '100%'
            display : 'flex'

        style =
            display:'flex'
            flexDirection:'column'
            height:'100vh'
            width:'100vw'
            overflow:'auto'

        <div ref="page" style={style}>
            <style>{page_style}</style>
            {<FileUsePageWrapper /> if @props.show_file_use}
            {<Support actions={@actions('support')} /> if @props.show}
            {<ConnectionInfo ping={@props.ping} status={@props.connection_status} avgping={@props.avgping} actions={@props.page_actions} /> if @props.show_connection}
            {<VersionWarning new_version={@props.new_version} /> if @props.new_version?}
            {<CookieWarning /> if @props.cookie_warning}
            {<Navbar style={marginBottom: 0, overflowY:'hidden', width:'100%', minHeight:'44px', position:'fixed', right:'0', zIndex:'100', opacity:'0.8'}>
                <div id="smc-top-nav-shim" style={shim_style} >
                    {@render_project_nav_button() if @props.is_logged_in()}
                    {@render_project_tabs()}
                    {@render_right_nav()}
                </div>
            </Navbar> if not @props.fullscreen}
            <div className="smc-sticky-position-hack" style={minHeight:'44px'}>
            </div>
            <FullscreenButton />
            {# Children must define their own padding from navbar and screen borders}
            {# Note that the parent is a flex container}
            {@render_page()}
        </div>

$('body').css('padding-top':0).append('<div class="page-container smc-react-container" style="overflow:hidden"></div>')
page = <Redux redux={redux}>
    <Page redux={redux} page_actions={redux.getActions('page')} notification_count=1 />
</Redux>
ReactDOM.render(page, $(".smc-react-container")[0])
