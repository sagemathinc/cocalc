{React, ReactDOM, rclass, redux, rtypes, Redux, Actions, Store} = require('./smc-react')
{Button, Col, Row, Modal, NavItem} = require('react-bootstrap')
{Icon, Tip} = require('./r_misc')
{salvus_client} = require('./salvus_client')

{HelpPage} = require('./r_help')
{ProjectsPage} = require('./projects')
{ProjectPage, MobileProjectPage} = require('./project_page')
{AccountPage} = require('./account_page')

exports.ActiveAppContent = ({active_top_tab, render_small}) ->
    switch active_top_tab
        when 'projects'
            return <ProjectsPage />
        when 'account'
            return <AccountPage />
        when 'about'
            return <HelpPage />
        when 'help'
            return <div>To be implemented</div>
        when undefined
            return
        else
            project_name = redux.getProjectStore(active_top_tab).name
            if render_small
                <MobileProjectPage name={project_name} project_id={active_top_tab} />
            else
                <ProjectPage name={project_name} project_id={active_top_tab} />

exports.NavTab = rclass
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

exports.ConnectionIndicator = rclass
    displayName : 'ConnectionIndicator'

    reduxProps :
        page :
            avgping : rtypes.number
            connection_status : rtypes.string

    propTypes :
        ping : rtypes.number
        status : rtypes.string
        actions : rtypes.object
        on_click : rtypes.func

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
        @props.on_click?()

    render : ->
        outer_styles =
            width : '7.5em'
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

exports.ConnectionInfo = rclass
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
        @actions('page').show_connection(false)

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

exports.FullscreenButton = rclass
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

exports.SMCLogo = rclass
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

exports.VersionWarning = rclass
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

exports.CookieWarning = rclass
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