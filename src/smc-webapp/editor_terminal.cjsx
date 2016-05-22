# Terminal panel for .term files.

# standard non-SMC libraries
immutable  = require('immutable')
underscore = require('underscore')

# SMC libraries
{defaults, path_split, required} = require('smc-util/misc')
{salvus_client} = require('./salvus_client')

{synchronized_string} = require('./syncdoc')

# React libraries
{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Loading, SearchInput} = require('r_misc')
{Button, Col, Row, ButtonToolbar, Input} = require('react-bootstrap')

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

syncdbs = {}
exports.init_redux = init_redux = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, DevTerminalActions)
    store   = redux.createStore(name, default_store_state(project_id, filename))

    # What kind of sync should this be? Does it need a sync?
    #console.log("getting syncstring for '#{filename}'")
    #synchronized_string
    #    project_id    : project_id
    #    filename      : filename
    #    sync_interval : 100
    #    cb            : (err, syncstring) ->
    #        if err
    #            actions.report_error("unable to open #{@filename}")
    #        else
    #            syncstring.on('sync', actions.sync)
    #            store.syncstring = actions.syncstring = syncstring
    #            actions.set_value(syncstring.live())

# Putting client -> server actions here as well as action -> state
class DevTerminalActions extends Actions
    sync : ->
        console.log("sync called")

    get_store : =>
        return @redux.getStore(@name)

    # Probably not the best way to handle this
    connect_terminal : (cb) =>
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

    connect_to_server : (cb) =>
        store = @get_store()
        project_id = store.get('project_id')
        session_uuid = store.get('session_uuid')
        settings = store.get('settings')
        filename = store.get('filename')

        path = path_split(filename).head
        mesg =
            timeout    : 30  # just for making the connection; not the timeout of the session itself!
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
                cols     : 300
                path     : path
                filename : filename

        if session_uuid?
            mesg.session_uuid = session_uuid
            salvus_client.connect_to_session(mesg)
        else
            salvus_client.new_session(mesg)

    report_error : (err) ->
        console.log("Error in DevTerminalActions: ", err)

    sync: =>
        @set_value(@syncstring.live())

    set_value: (value) =>
        if @redux.getStore(@name).get('value') != value
            @setState(value: value)
            @syncstring.live(value)
            @syncstring.sync()

# Makes a terminal which wraps terminal.js
TerminalEditor = (name) -> rclass
    displayName : "DevTerminal"

    reduxProps :
        "#{name}" :
            session_uuid : rtypes.string
            settings   : rtypes.object
            filename   : rtypes.string

    propTypes :
        editor     : rtypes.object
        project_id : rtypes.string
        actions    : rtypes.object.isRequired
        editor     : rtypes.object

    _init_terminal : ->
        # Find the DOM node
        node = $(ReactDOM.findDOMNode(@))

        @_terminal = new Console
            element   : node
            title     : "Terminal"
            filename  : @props.filename
            resizable : false
            project_id: @props.project_id
            editor    : @props.editor

    componentDidMount : ->
        @_init_terminal()
        @props.actions.connect_terminal((session) => @_terminal.set_session(session); console.log("THIS IS THE SESSION: ", session))
        @_terminal.resize()

    render : ->
        <div>
            <textarea />
        </div>

# boilerplate fitting this into SMC below
render = (opts) ->
    {redux, project_id, filename, editor} = opts
    name = redux_name(project_id, filename)
    actions = redux.getActions(name)
    C = TerminalEditor(name)
    <Redux redux={redux}>
        <C redux={redux} name={name} actions={actions} project_id={project_id} path={filename} editor={editor}/>
    </Redux>

exports.render = (opts) ->
    console.log("editor_terminal: render")
    {project_id, filename, dom_node, redux, editor} = opts
    init_redux(redux, project_id, filename)
    pack =
        redux      : redux
        project_id : project_id
        filename   : filename
        editor     : editor
    ReactDOM.render(render(pack), dom_node)

exports.hide = (opts) ->
    {project_id, filename, dom_node, redux} = opts
    console.log("editor_terminal: hide")
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (opts) ->
    {project_id, filename, dom_node, redux, editor} = opts
    console.log("editor_terminal: show")
    pack =
        redux      : redux
        project_id : project_id
        filename  : filename
        editor     : editor
    ReactDOM.render(render(pack), dom_node)

exports.free = (opts) ->
    console.log("editor_terminal: free")
    {project_id, filename, dom_node, redux} = opts

    fname = redux_name(project_id, filename)
    store = redux.getStore(fname)
    if not store?
        return
    ReactDOM.unmountComponentAtNode(dom_node)
    store.syncstring?.disconnect_from_session()
    delete store.state
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    redux.removeStore(fname)
    redux.removeActions(fname)
