# Terminal panel for .term files.

# standard non-SMC libraries
immutable  = require('immutable')
underscore = require('underscore')

# SMC libraries
{defaults, path_split, required} = require('smc-util/misc')
{salvus_client} = require('./salvus_client')

{synchronized_string} = require('./syncdoc')

# React libraries
{React, ReactDOM, rclass, rtypes, Redux, redux, Actions, Store}  = require('./smc-react')
{Loading, SearchInput, Icon} = require('r_misc')
{Alert, Button, Col, Row, Panel, ButtonToolbar, Input} = require('react-bootstrap')

# Ensure the console jquery plugin is available
{Console} = require('./console')

# file name is a full path and project_id is a uuid so this is
# nearly guaranteed to be unique.
redux_name = (project_id, filename) ->
    return "editor-#{project_id}-#{filename}"

# boilerplate setting up actions, stores, sync'd file, etc.
default_store_state = (project_id, filename) ->
    settings : {}
    session_uuid : undefined
    filename : filename
    project_id : project_id
    value     : ''

init_redux = (path, redux, project_id) ->
    name = redux_name(project_id, filename)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, DevTerminalActions)
    store   = redux.createStore(name, default_store_state(project_id, filename))

    # What kind of sync should this be? Does it need a sync?
    console.log("getting syncstring for '#{filename}'")
    synchronized_string
        project_id    : project_id
        filename      : filename
        sync_interval : 100
        cb            : (err, syncstring) ->
            if err
                actions.report_error("unable to open #{@filename}")
            else
                syncstring.on('sync', actions.sync)
                store.syncstring = actions.syncstring = syncstring
                actions.set_value(syncstring.live())
    return name

remove_redux = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    store = redux.getStore(name)
    if not store?
        return
    store.syncstring?.destroy()
    delete store.state
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    redux.removeStore(name)
    redux.removeActions(name)
    return name

# Putting client -> server actions here as well as action -> state
class DevTerminalActions extends Actions
    get_store: =>
        return @redux.getStore(@name)

    # Probably not the best way to handle this
    connect_terminal: (cb) =>
        store = @get_store()
        if store.get('session')
            return # Session already exists
        project_id = store.get('project_id')
        session_uuid = store.get('session_uuid')
        filename = store.get('filename')

        salvus_client.read_text_file_from_project
            project_id : project_id
            path       : filename
            cb         : (err, result) =>
                if err
                    report_error(err)
                else
                    # New session or connect to session
                    if result.content? and result.content.length < 36
                        # empty/corrupted -- messed up by bug in early version of SMC...
                        delete result.content
                    @setState
                        session_uuid : result.content
                    @connect_to_server(cb)

    connect_to_server: (cb) =>
        store = @get_store()
        project_id = store.get('project_id')
        session_uuid = store.get('session_uuid')
        settings = store.get('settings')
        filename = store.get('filename')

        path = path_split(filename).head
        mesg =
            timeout    : 60  # just for making the connection; not the timeout of the session itself!
            type       : 'console'
            project_id : project_id
            cb : (err, session) =>
                if err
                    @report_error(err)
                    cb?(err)
                else if session
                    @setState
                        session_uuid : session.session_uuid
                        session      : session
                    cb?(session)
            params :
                command  : 'bash'
                rows     : 100
                cols     : 200
                path     : path
                filename : filename

        if session_uuid?
            mesg.session_uuid = session_uuid
            salvus_client.connect_to_session(mesg)
        else
            salvus_client.new_session(mesg)

    report_error: (err) ->
        console.log("Error in DevTerminalActions: ", err)

    sync: =>
        @set_value(@syncstring.live())

    increment_font_size: ->
        console.log('increment_font_size being called')
        @setState('font_size':(@get_store().get('font_size') + 1))

    set_title: (title) =>
      @setState(title:title)

    set_value: (value) =>
        if @redux.getStore(@name).get('value') != value
            console.log("SET_VALUE THIS = ", @)
            @setState(value: value)
            @syncstring.live(value)
            @syncstring.sync()

# Makes a terminal which wraps terminal.js
exports.TerminalEditor = rclass ({name}) ->
    displayName : "DevTerminal"

    reduxProps :
        "#{name}" :
            session_uuid : rtypes.string
            settings   : rtypes.object
            filename   : rtypes.string
            font_size  : rtypes.number
            title      : rtypes.string
            rows       : rtypes.number
            cols       : rtypes.number
            value      : rtypes.string

    propTypes :
        editor     : rtypes.object
        project_id : rtypes.string
        actions    : rtypes.object.isRequired
        editor     : rtypes.object

    getDefaultProps: ->
      font_size : 12
      title : 'Terminal'
      rows : 30
      cols : 80

    getInitialState: ->
        paused : false
        reconnecting : false

    _init_terminal: ->
        # Find the DOM node
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]

        @_terminal = new Console
            element     : node
            title       : @props.title
            filename    : @props.filename
            project_id  : @props.project_id
            editor      : @props.editor
            on_pause    : @toggle_pause
            on_unpause  : @toggle_pause
            on_reconnecting : (() => @setState({reconnecting : true}))
            on_reconnected : (() => @setState({reconnecting : false}))
            set_title   : @props.actions.set_title
            cols        : @props.cols
            rows        : @props.rows
            font :
                size    : @props.font_size

    componentDidMount: ->
        console.log("terminal didMount")
        @_init_terminal()

        # Something is wrong in the connection. Requires page refresh for some reason.
        @props.actions.connect_terminal((session) => @_terminal.set_session(session); console.log("THIS IS THE SESSION: ", session))
        #@_terminal.update_scrollbar()
        console.log("PASSED VALUE: ", @props.value)
        if @props.value
            @_terminal.value = @props.value

    componentWillReceiveProps: (newProps) ->
        console.log("NEW PROPS: ", newProps)
        console.log("OLD PROPS: ", @props)

    componentWillUnmount: ->
        console.log("terminal willUnmount")
        if @_terminal?
            console.log("TERMINAL VALUE:", @_terminal.value)
            if @props.actions.syncstring?
                @props.actions.set_value(@_terminal.value)
            @_terminal.remove()

    increase_font_size: ->
        console.log("Increase font size")
        @_terminal._increase_font_size()

    decrease_font_size: ->
        console.log("Decrease font size")
        @_terminal._decrease_font_size()

    reconnect: ->
        console.log("Reconnecting")
        @_terminal.session?.reconnect()

    toggle_pause: (e) ->
        console.log("Pausing Terminal")
        if e   # Was triggered from button, not from @_terminal
            @_terminal._on_pause_button_clicked(e)
        @setState
            paused : not @state.paused

    open_history_file: ->
        console.log("Opening history file")
        @_terminal.open_copyable_history()

    open_init_file: ->
        console.log("opening Init file")
        @_terminal.open_init_file()

    header: ->
        <Row style={padding:'0px'}>
            <Col sm=2>
                <ButtonToolbar style={marginLeft:'2px'}>
                    <Button onClick={@decrease_font_size} bsSize="small" style={marginLeft:'0px'}>
                        <Icon name={'font'} style={fontSize:'7pt'}/>
                    </Button>

                    <Button onClick={@increase_font_size} bsSize="small" style={marginLeft:'0px'}>
                        <Icon name={'font'} style={fontSize:'10pt'} />
                    </Button>

                    <Button onClick={@reconnect} bsSize="small" style={marginLeft:'0px'}
                            bsStyle={if @state.reconnecting then 'success'} >
                        <Icon name='refresh' spin={@state.reconnecting} />
                    </Button>

                    <Button onClick={@toggle_pause} bsSize="small" style={marginLeft:'0px'} bsStyle={if @state.paused then 'success'} >
                        <Icon name={if @state.paused then 'play' else 'pause'} />
                    </Button>

                    <Button onClick={@open_history_file} bsSize="small" style={marginLeft:'0px'}>
                        <Icon name={'history'} />
                    </Button>

                    <Button onClick={@open_init_file} bsSize="small" style={marginLeft:'0px'}>
                        <Icon name={'rocket'} />
                    </Button>
                </ButtonToolbar>
            </Col>
            <Col sm=8>
                <div style={fontWeight:'bold', paddingTop:'3px'}>
                    {@props.filename}
                </div>
            </Col>
            <Col sm=2 xsHidden={true}>
                <div style={fontWeight:'bold', textAlign:'right', paddingTop:'3px'}>
                    {@props.title}
                </div>
            </Col>
        </Row>

    # This is an interesting way to change Panel's internal css
    # Not sure if there's a better way
    style_injection: ->
        <style type="text/css">
            {"\
                .panel-heading {\
                    padding: 1px;\
                }\
                .panel-body {\
                    padding: 1px;\
                }\
            "}
        </style>

    render: ->
        <div>
            {@style_injection()}
            <Panel header={@header()} >
                <div className='smc-react-terminal' style={fontSize:"#{@props.font_size}px"}>
                    <textarea />
                </div>
            </Panel>
        </div>

require('project_file').register_file_editor
    ext         : ['term', 'sage-term']
    icon        : 'file-code-o'
    init      : init_redux
    component : TerminalEditor
    remove    : remove_redux