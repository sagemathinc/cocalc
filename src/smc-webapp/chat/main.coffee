
info = require('./info')
{generate_name} = require('./util')

exports.SideChat   = require('./side_chat').SideChat
exports.EditorChat = require('./editor_chat').EditorChat

# Expects a state application with stores and actions
# Set up actions, stores, syncdb, etc.
# init_redux returns the name of the redux actions/store associated to this chatroom
exports.init = (path, redux, project_id) ->
    name = generate_name(project_id, path)
    if redux.getActions(name)?
        return name  # already initialized

    actions = redux.createActions(name, ChatActions)
    store   = redux.createStore(name)

    actions._init()

    syncdb = webapp_client.sync_db
        project_id   : project_id
        path         : path
        primary_keys : ['date']
    syncdb.once 'init', (err) =>
        if err
            mesg = "Error opening '#{path}' -- #{err}"
            console.warn(mesg)
            alert_message(type:"error", message:mesg)
            return
        actions.syncdb = syncdb
        actions.store = store
        actions.init_from_syncdb()
        syncdb.on('change', actions._syncdb_change)
    return name

exports.remove = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    actions = redux.getActions(name)
    actions?.syncdb?.close()
    store = redux.getStore(name)
    if not store?
        return
    delete store.state
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    redux.removeStore(name)
    redux.removeActions(name)
    return name

ChatEditorGenerator = (path, redux, project_id) ->
    name = redux_name(project_id, path)
    C_ChatRoom = ({actions}) ->
        <ChatRoom
            redux       = {redux}
            path        = {path}
            name        = {name}
            actions     = {actions}
            project_id  = {project_id}
            />

    C_ChatRoom.propTypes =
        actions : rtypes.object.isRequired

    return C_ChatRoom

require('project_file').register_file_editor
    ext       : 'sage-chat'
    icon      : 'comment'
    init      : init_redux
    generator : ChatEditorGenerator
    remove    : remove_redux