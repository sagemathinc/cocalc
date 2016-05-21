# Terminal panel for .term files.

# standard non-SMC libraries
immutable  = require('immutable')
underscore = require('underscore')

# SMC libraries
{defaults, required} = require('smc-util/misc')
{salvus_client} = require('./salvus_client')

{synchronized_string} = require('./syncdoc')

# React libraries
{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Loading, SearchInput} = require('r_misc')
{Button, Col, Row, ButtonToolbar, Input} = require('react-bootstrap')

# Ensure the console jquery plugin is available
{Console} = require('./console')

# file name is a full file_path and project_id is a uuid so this is
# nearly guaranteed to be unique.
redux_name = (project_id, filename) ->
    return "editor-#{project_id}-#{filename}"

class DevTerminalActions extends Actions
    sync : ->
        console.log("sync called")

    get_store : =>
        return @redux.getStore(@name)

    connect_to_server: (cb) =>
        store = @get_store()
        project_id = store.get('project_id')
        session_uuid = store.get('session_uuid')
        settings = store.get('settings')
        filename = store.get('filename')
        mesg =
            timeout    : 30  # just for making the connection; not the timeout of the session itself!
            type       : 'terminal'
            project_id : project_id
            cb : (err, session) =>
                if err
                    # alert_message(type:'error', message:err)
                    cb?(err)
                else
                    @redux.setState
                        session_uuid : session.session_uuid
                    cb(err, session)

        if session_uuid?
            mesg.session_uuid = session_uuid
            salvus_client.connect_to_session(mesg)
        else
            salvus_client.new_session(mesg)

# boilerplate setting up actions, stores, sync'd file, etc.
default_store_state =
    settings : {}
    session_uuid : ''
    file_name : ''

syncdbs = {}
exports.init_redux = init_redux = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, DevTerminalActions)
    store   = redux.createStore(name, default_store_state)

    # What kind of sync should this be? Does it need a sync?
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

# Makes a terminal which wraps terminal.js
TerminalEditor = (name) -> rclass
    displayName : "DevTerminal"

    reduxProps :
        "#{name}" :
            session_uuid : rtypes.string
            settings   : rtypes.object
            filename   : rtypes.string

    propTypes :
        project_id : rtypes.string
        actions    : rtypes.object

    _init_terminal : ->
        # Find the DOM node
        node = $(ReactDOM.findDOMNode(@))

        @_terminal = new Console
            element   : node
            title     : "Terminal"
            filename  : @props.filename
            resizable : false

    componentDidMount : ->
        @_init_terminal()

    render : ->
        <div>
        </div>

# boilerplate fitting this into SMC below
render = (opts) ->
    {redux, project_id, path} = opts
    name = redux_name(project_id, path)
    C = TerminalEditor(name)
    <Redux redux={redux}>
        <C redux={redux} name={name} project_id={project_id} path={path}/>
    </Redux>

exports.render = (opts) ->
    console.log("editor_terminal: render")
    {project_id, file_path, dom_node, redux} = opts
    init_redux(redux, project_id, file_path)
    pack =
        redux      : redux
        project_id : project_id
        file_path  : file_path
    ReactDOM.render(render(pack), dom_node)

exports.hide = (opts) ->
    {project_id, file_path, dom_node, redux} = opts
    console.log("editor_terminal: hide")
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (opts) ->
    {project_id, file_path, dom_node, redux} = opts
    console.log("editor_terminal: show")
    pack =
        redux      : redux
        project_id : project_id
        file_path  : file_path
    ReactDOM.render(render(pack), dom_node)

exports.free = (opts) ->
    console.log("editor_terminal: free")
    {project_id, file_path, dom_node, redux} = opts

    fname = redux_name(project_id, file_path)
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
