###
Synchronized Documents

A merge map, with the arrows pointing upstream:

        else
            @editor._set("Loading...")

     [client]s.. ---> [hub] ---> [local hub] <--- [hub] <--- [client] <--- YOU ARE HERE
                      /|\             |
     [client]-----------             \|/
                              [a file on disk]

The Global Architecture of Synchronized Documents:

Imagine say 1000 clients divided evenly amongst 10 hubs (so 100 clients per hub).
There is only 1 local hub, since it is directly linked to an on-disk file.

The global hubs manage their 100 clients each, merging together sync's, and sending them
(as a batch) to the local hub.  Broadcast messages go from a client, to its hub, then back
to the other 99 clients, then on to the local hub, out to 9 other global hubs, and off to
their 900 clients in parallel.

###

# seconds to wait for synchronized doc editing session, before reporting an error.
# Don't make this too short, since when we open a link to a file in a project that
# hasn't been opened in a while, it can take a while.
CONNECT_TIMEOUT_S = 45

DEFAULT_TIMEOUT   = 35

log = (s) -> console.log(s)

diffsync = require('diffsync')

misc     = require('misc')
{defaults, required} = misc

misc_page = require('misc_page')

message  = require('message')


{salvus_client} = require('salvus_client')
{alert_message} = require('alerts')

{IS_MOBILE} = require("feature")

async = require('async')

templates           = $("#salvus-editor-templates")
cell_start_template = templates.find(".sagews-input")
output_template     = templates.find(".sagews-output")

salvus_threejs = require("salvus_threejs")

account = require('account')


CLIENT_SIDE_MODE_LINES = []
for mode in ['md', 'html', 'coffeescript', 'javascript']
    for s in ['', '(hide=false)', '(hide=true)', '(once=false)']
        CLIENT_SIDE_MODE_LINES.push("%#{mode}#{s}")

# Return true if there are currently unsynchronized changes, e.g., due to the network
# connection being down, or SageMathCloud not working, or a bug.
exports.unsynced_docs = () ->
    return $(".salvus-editor-codemirror-not-synced:visible").length > 0

class DiffSyncDoc
    # Define exactly one of cm or string.
    #     cm     = a live codemirror editor
    #     string = a string
    constructor: (opts) ->
        @opts = defaults opts,
            cm       : undefined
            string   : undefined
            readonly : false   # only impacts the editor
        if not ((opts.cm? and not opts.string?) or (opts.string? and not opts.cm?))
            console.log("BUG -- exactly one of opts.cm and opts.string must be defined!")

    copy: () =>
        # always degrades to a string
        if @opts.cm?
            return new DiffSyncDoc(string:@opts.cm.getValue())
        else
            return new DiffSyncDoc(string:@opts.string)

    string: () =>
        if @opts.string?
            return @opts.string
        else
            return @opts.cm.getValue()  # WARNING: this is *not* cached.

    diff: (v1) =>
        # TODO: when either is a codemirror object, can use knowledge of where/if
        # there were edits as an optimization
        return diffsync.dmp.patch_make(@string(), v1.string())

    patch: (p) =>
        return new DiffSyncDoc(string: diffsync.dmp.patch_apply(p, @string())[0])

    checksum: () =>
        return @string().length

    patch_in_place: (p) =>
        if @opts.string
            console.log("patching string in place -- should never happen")
            @opts.string = diffsync.dmp.patch_apply(p, @string())[0]
        else
            cm = @opts.cm
            cm.setOption('readOnly', true)
            try
                s = @string()
                x = diffsync.dmp.patch_apply(p, s)
                new_value = x[0]

                next_pos = (val, pos) ->
                    # This functions answers the question:
                    # If you were to insert the string val at the CodeMirror position pos
                    # in a codemirror document, at what position (in codemirror) would
                    # the inserted string end at?
                    number_of_newlines = (val.match(/\n/g)||[]).length
                    if number_of_newlines == 0
                        return {line:pos.line, ch:pos.ch+val.length}
                    else
                        return {line:pos.line+number_of_newlines, ch:(val.length - val.lastIndexOf('\n')-1)}

                pos = {line:0, ch:0}  # start at the beginning
                diff = diffsync.dmp.diff_main(s, new_value)
                for chunk in diff
                    #console.log(chunk)
                    op  = chunk[0]  # 0 = stay same; -1 = delete; +1 = add
                    val = chunk[1]  # the actual text to leave same, delete, or add
                    pos1 = next_pos(val, pos)
                    switch op
                        when 0 # stay the same
                            # Move our pos pointer to the next position
                            pos = pos1
                            #console.log("skipping to ", pos1)
                        when -1 # delete
                            # Delete until where val ends; don't change pos pointer.
                            cm.replaceRange("", pos, pos1)
                            #console.log("deleting from ", pos, " to ", pos1)
                        when +1 # insert
                            # Insert the new text right here.
                            cm.replaceRange(val, pos)
                            #console.log("inserted new text at ", pos)
                            # Move our pointer to just beyond the text we just inserted.
                            pos = pos1
            catch e
                console.log("BUG in patch_in_place")
            cm.setOption('readOnly', @opts.readonly)

# DiffSyncDoc is useful outside, e.g., for task list.
exports.DiffSyncDoc = DiffSyncDoc

codemirror_diffsync_client = (cm_session, content) ->
    # This happens on initialization and reconnect.  On reconnect, we could be more
    # clever regarding restoring the cursor and the scroll location.
    cm_session.codemirror._cm_session_cursor_before_reset = cm_session.codemirror.getCursor()
    cm_session.codemirror.setValueNoJump(content)

    return new diffsync.CustomDiffSync
        doc            : new DiffSyncDoc(cm:cm_session.codemirror, readonly: cm_session.readonly)
        copy           : (s) -> s.copy()
        diff           : (v0,v1) -> v0.diff(v1)
        patch          : (d, v0) -> v0.patch(d)
        checksum       : (s) -> s.checksum()
        patch_in_place : (p, v0) -> v0.patch_in_place(p)

# The DiffSyncHub class represents a global hub viewed as a
# remote server for this client.
class DiffSyncHub
    constructor: (@cm_session) ->

    connect: (remote) =>
        @remote = remote

    recv_edits: (edit_stack, last_version_ack, cb) =>
        @cm_session.call
            message : message.codemirror_diffsync(edit_stack:edit_stack, last_version_ack:last_version_ack)
            timeout : DEFAULT_TIMEOUT
            cb      : (err, mesg) =>
                if err
                    cb(err)
                else if mesg.event != 'codemirror_diffsync'
                    # various error conditions, e.g., reconnect, etc.
                    if mesg.error?
                        cb(mesg.error)
                    else
                        cb(true)
                else
                    @remote.recv_edits(mesg.edit_stack, mesg.last_version_ack, cb)


{EventEmitter} = require('events')

class AbstractSynchronizedDoc extends EventEmitter
    constructor: (opts) ->
        @opts = defaults opts,
            project_id : required
            filename   : required
            sync_interval : 1000    # no matter what, we won't send sync messages back to the server more frequently than this (in ms)
            cb         : required   # cb(err) once doc has connected to hub first time and got session info; will in fact keep trying until success

        @project_id = @opts.project_id   # must also be set by derived classes that don't call this constructor!
        @filename   = @opts.filename

        @connect    = misc.retry_until_success_wrapper(f:@_connect)#, logname:'connect')
        @sync       = misc.retry_until_success_wrapper(f:@_sync, min_interval:@opts.sync_interval)#, logname:'sync')
        @save       = misc.retry_until_success_wrapper(f:@_save, min_interval:2*@opts.sync_interval)#, logname:'save')

        #console.log("connect: constructor")
        @connect (err) =>
            opts.cb(err, @)

    _connect: (cb) =>
        throw "define _connect in derived class"

    _add_listeners: () =>
        # We *have* to wrapper all the listeners
        if @_listeners?
            # if we already added listeners before (for a prior connection?), remove them before re-adding them?
            @_remove_listeners()
        @_listeners =
            codemirror_diffsync_ready : ((mesg) => @__diffsync_ready(mesg))
            codemirror_bcast          : ((mesg) => @__receive_broadcast(mesg))
            signed_in                 : (()     => @__reconnect())
        for e, f of @_listeners
            salvus_client.on(e, f)

    _remove_listeners: () =>
        for e, f of @_listeners
            salvus_client.removeListener(e, f)

    __diffsync_ready: (mesg) =>
        if mesg.session_uuid == @session_uuid
            @_patch_moved_cursor = true
            @sync()

    send_broadcast_message: (mesg, self) =>
        if @session_uuid?  # can't send until we have connected.
            m = message.codemirror_bcast
                session_uuid : @session_uuid
                mesg         : mesg
                self         : self    #if true, then also include this client to receive message
            @call
                message : m
                timeout : 0

    __receive_broadcast: (mesg) =>
        if mesg.session_uuid == @session_uuid
            switch mesg.mesg.event
                when 'update_session_uuid'
                    # This just doesn't work yet -- not really implemented in the hub -- so we force
                    # a full reconnect, which is safe.
                    #@session_uuid = mesg.mesg.new_session_uuid
                    #console.log("connect: update_session_uuid")
                    @connect()
                when 'cursor'
                    @_receive_cursor(mesg)
                else
                    @_receive_broadcast?(mesg)  # can be define in derived class

    __reconnect: () =>
        # The main websocket to the remote server died then came back, so we
        # setup a new syncdoc session with the remote hub.  This will work fine,
        # even if we connect to a different hub.
        #console.log("connect: __reconnect")
        @connect (err) =>

    _apply_patch_to_live: (patch) =>
        @dsync_client._apply_edits_to_live(patch)

    # @live(): the current live version of this document as a string, or
    # @live(s): set the live version
    live: (s) =>
        if s?
            @dsync_client.live = s
        else
            return @dsync_client?.live

    # "sync(cb)": keep trying to synchronize until success; then do cb()
    # _sync(cb) -- try once to sync; on any error cb(err).
    _sync: (cb) =>
        #console.log("_sync")
        @_presync?()
        snapshot = @live()
        @dsync_client.push_edits (err) =>
            if err
                if err.indexOf('retry') != -1
                    # This is normal -- it's because the diffsync algorithm only allows sync with
                    # one client (and upstream) at a time.
                    cb?(err)
                else if err == 'reloading'
                    cb?(err)
                else  # all other errors should reconnect first.
                    #console.log("connect: due to sync error: #{err}")
                    @connect () =>
                        cb?(err)
            else
                s = snapshot
                if s.copy?
                    s = s.copy()
                @_last_sync = s    # What was the last successful sync with upstream.
                @emit('sync')
                cb?()

    # save(cb): write out file to disk retrying until success.
    # _save(cb): try to sync then write to disk; if anything goes wrong, cb(err).
    _save: (cb) =>
        if not @dsync_client?
            cb("must be connected before saving"); return
        if @readonly
            cb(); return
        @sync (err) =>
            if err
                cb(err); return
            @call
                message : message.codemirror_write_to_disk()
                timeout : DEFAULT_TIMEOUT
                cb      : (err, resp) =>
                    if err
                        cb(err)
                    else if resp.event != 'success'
                        cb(resp)
                    else
                        cb()

    call: (opts) =>
        opts = defaults opts,
            message        : required
            timeout        : DEFAULT_TIMEOUT
            multi_response : false
            cb             : undefined
        opts.message.session_uuid = @session_uuid
        salvus_client.call_local_hub
            multi_response : opts.multi_response
            message        : opts.message
            timeout        : opts.timeout
            project_id     : @project_id
            cb             : (err, resp) =>
                #console.log("call: #{err}, #{misc.to_json(resp)}")
                opts.cb?(err, resp)

    broadcast_cursor_pos: (pos) =>
        @send_broadcast_message({event:'cursor', pos:pos, patch_moved_cursor:@_patch_moved_cursor}, false)
        delete @_patch_moved_cursor

    _receive_cursor: (mesg) =>
        # If the cursor has moved, draw it.  Don't bother if it hasn't moved, since it can get really
        # annoying having a pointless indicator of another person.
        key = mesg.color + mesg.name
        if not @other_cursors?
            @other_cursors = {}
        else
            pos = @other_cursors[key]
            if pos? and JSON.stringify(pos) == JSON.stringify(mesg.mesg.pos)
                return
        # cursor moved.
        @other_cursors[key] = mesg.mesg.pos   # record current position
        @draw_other_cursor(mesg.mesg.pos, '#' + mesg.color, mesg.name, mesg.mesg.patch_moved_cursor)

    draw_other_cursor: (pos, color, name) =>
        # overload this in derived class



class SynchronizedString extends AbstractSynchronizedDoc
    # "connect(cb)": Connect to the given server; will retry until it succeeds.
    # _connect(cb): Try once to connect and on any error, cb(err).
    _connect: (cb) =>

        if @_connect_lock  # this lock is purely defense programming; it should be impossible for it to be hit.
            m = "bug -- connect_lock bug in SynchronizedString; this should never happen -- PLEASE REPORT!"
            alert_message(type:"error", message:m)
            cb(m)
        @_connect_lock = true

        @_remove_listeners()
        delete @session_uuid
        #console.log("_connect -- '#{@filename}'")
        @call
            timeout : CONNECT_TIMEOUT_S    # a reasonable amount of time, since file could be *large*
            message : message.codemirror_get_session
                path         : @filename
                project_id   : @project_id
            cb      : (err, resp) =>
                if resp.event == 'error'
                    err = resp.error
                if err
                    delete @_connect_lock
                    cb?(err); return

                @session_uuid = resp.session_uuid
                @readonly = resp.readonly

                patch = undefined
                synced_before = false
                if @_last_sync?
                    # We have sync'd before.
                    @_presync?() # give syncstring chance to be updated by true live.
                    patch = @dsync_client._compute_edits(@_last_sync, @live())
                    synced_before = true

                @dsync_client = new diffsync.DiffSync(doc:resp.content)

                if not synced_before
                    # This initialiation is the first.
                    @_last_sync   = resp.content
                    reconnect = false

                @dsync_server = new DiffSyncHub(@)
                @dsync_client.connect(@dsync_server)
                @dsync_server.connect(@dsync_client)
                @_add_listeners()

                if reconnect
                    @emit('reconnect')

                delete @_connect_lock
                cb?()

                # This patch application below must happen *AFTER* everything above, including
                # the callback, since that fully initializes the document and sync mechanisms.
                if synced_before
                    # applying missed patches to the new upstream version that we just got from the hub.
                    #console.log("now applying missed patches to the new upstream version that we just got from the hub: ", patch)
                    @_apply_patch_to_live(patch)
                    reconnect = true

    disconnect_from_session: (cb) =>
        @_remove_listeners()
        if @session_uuid? # no need to re-disconnect if not connected (and would cause serious error!)
            @call
                timeout : DEFAULT_TIMEOUT
                message : message.codemirror_disconnect(session_uuid : @session_uuid)
                cb      : cb



synchronized_string = (opts) ->
    new SynchronizedString(opts)

exports.synchronized_string = synchronized_string

class SynchronizedDocument extends AbstractSynchronizedDoc
    constructor: (@editor, opts, cb) ->  # if given, cb will be called when done initializing.
        @opts = defaults opts,
            cursor_interval   : 1000
            sync_interval     : 750     # never send sync messages up stream more often than this
            revision_tracking : account.account_settings.settings.editor_settings.track_revisions   # if true, save every revision in @.filename.sage-history
        @project_id = @editor.project_id

        @filename    = @editor.filename

        #@connect    = misc.retry_until_success_wrapper(f:@_connect, max_tries:3)#, logname:'connect')
        @connect    = @_connect
        @sync       = misc.retry_until_success_wrapper(f:@_sync, min_interval:@opts.sync_interval)#, logname:'sync')
        @save       = misc.retry_until_success_wrapper(f:@_save, min_interval:2*@opts.sync_interval)#, logname:'save')


        @editor.save = @save
        @codemirror  = @editor.codemirror
        @editor._set("Loading...")
        @codemirror.setOption('readOnly', true)
        @editor.codemirror1.setOption('readOnly', true)
        @element     = @editor.element

        @init_cursorActivity_event()

        synchronized_string
            project_id    : @project_id
            filename      : misc.meta_file(@filename, 'chat')
            sync_interval : 1000
            cb            : (err, chat_session) =>
                if not err  # err actually can't happen, since we retry until success...
                    @chat_session = chat_session
                    @init_chat()

        @on 'sync', () =>
            @ui_synced(true)

        #console.log("connect: constructor")
        @connect (err) =>
            if err
                if err.indexOf("ENOENT") != -1
                    bootbox.alert "<h3>Unable to open '#{@filename}'</h3> - file does not exist", () =>
                        @editor.editor.close(@filename)
                else
                    bootbox.alert "<h3>Unable to open '#{@filename}'</h3> - #{misc.to_json(err)}", () =>
                        @editor.editor.close(@filename)
            else
                @ui_synced(false)
                @editor.init_autosave()
                @sync()
                @codemirror.on 'changes', (instance, changes) =>
                    for changeObj in changes
                        #console.log("change #{misc.to_json(changeObj)}")
                        if changeObj.origin?
                            if changeObj.origin == 'undo'
                                @on_undo(instance, changeObj)
                            if changeObj.origin == 'redo'
                                @on_redo(instance, changeObj)
                            if changeObj.origin != 'setValue'
                                @ui_synced(false)
                                @sync()
            # Done initializing and have got content.
            cb?()

    _sync: (cb) =>
        if not @dsync_client?
            cb("not initialized")
            return
        super(cb)

    _connect: (cb) =>
        if @_connect_lock  # this lock is purely defense programming; it should be impossible for it to be hit.
            m = "bug -- connect_lock bug in SynchronizedDocument; this should never happen -- PLEASE REPORT!"
            alert_message(type:"error", message:m)
            cb(m)

        @_remove_listeners()
        @other_cursors = {}
        delete @session_uuid
        @ui_loading()
        @call
            timeout : CONNECT_TIMEOUT_S              # a reasonable amount of time, since file could be *large*
            message : message.codemirror_get_session
                path         : @filename
                project_id   : @editor.project_id
            cb      : (err, resp) =>
                @ui_loaded()
                if resp.event == 'error'
                    err = resp.error
                if err
                    delete @_connect_lock
                    cb?(err); return

                @session_uuid = resp.session_uuid
                @readonly = resp.readonly
                if @readonly
                    @editor.set_readonly_ui()

                @codemirror.setOption('readOnly', @readonly)
                @editor.codemirror1.setOption('readOnly', @readonly)
                if @_last_sync?
                    # We have sync'd before.
                    synced_before = true
                    patch = @dsync_client._compute_edits(@_last_sync, @live())
                else
                    # This initialiation is the first sync.
                    @_last_sync   = DiffSyncDoc(string:resp.content)
                    synced_before = false
                    @editor._set(resp.content)
                    @codemirror.clearHistory()  # ensure that the undo history doesn't start with "empty document"
                    @editor.codemirror1.clearHistory()
                    # I saw one case once where the above clearHistory didn't work -- i.e., we were
                    # still able to undo to the empty document; I don't understand how that is possible,
                    # since it should be totally synchronous.  So just in case, I'm doing another clearHistory
                    # 1 second after the document loads -- this means everything the user types
                    # in the first 1 second of editing can't be undone, which seems acceptable.
                    setTimeout( ( () => @codemirror.clearHistory(); @editor.codemirror1.clearHistory() ), 1000)

                @dsync_client = codemirror_diffsync_client(@, resp.content)
                @dsync_server = new DiffSyncHub(@)
                @dsync_client.connect(@dsync_server)
                @dsync_server.connect(@dsync_client)
                @_add_listeners()
                @editor.has_unsaved_changes(false) # TODO: start with no unsaved changes -- not tech. correct!!

                @emit 'connect'    # successful connection

                delete @_connect_lock
                cb?()

                # This patch application below must happen *AFTER* everything above, including
                # the callback, since that fully initializes the document and sync mechanisms.
                if synced_before
                    # applying missed patches to the new upstream version that we just got from the hub.
                    #console.log("now applying missed patches to the new upstream version that we just got from the hub: ", patch)
                    @_apply_patch_to_live(patch)
                    @emit 'sync'

                if @opts.revision_tracking
                    @call
                        message : message.codemirror_revision_tracking
                            session_uuid : @session_uuid
                            enable       : true
                        cb      : (err, resp) =>
                            if resp.event == 'error'
                                err = resp.error
                            if err
                                alert_message(type:"error", message:"error enabling revision saving -- #{err} -- #{@editor.filename}")

    ui_loading: () =>
        @element.find(".salvus-editor-codemirror-loading").show()

    ui_loaded: () =>
        @element.find(".salvus-editor-codemirror-loading").hide()


    on_undo: (instance, changeObj) =>
        # do nothing in base class

    on_redo: (instance, changeObj) =>
        # do nothing in base class

    __reconnect: () =>
        # The main websocket to the remote server died then came back, so we
        # setup a new syncdoc session with the remote hub.  This will work fine,
        # even if we connect to a different hub.
        #console.log("connect: __reconnect")
        @connect (err) =>

    disconnect_from_session: (cb) =>
        @_remove_listeners()
        @_remove_execute_callbacks()
        if @session_uuid?
            # no need to re-disconnect (and would cause serious error!)
            @call
                timeout : DEFAULT_TIMEOUT
                message : message.codemirror_disconnect()
                cb      : cb

        # store pref in localStorage to not auto-open this file next time
        @editor.local_storage('auto_open', false)
        @chat_session?.disconnect_from_session()

    execute_code: (opts) =>
        opts = defaults opts,
            code     : required
            data     : undefined
            preparse : true
            cb       : undefined
        uuid = misc.uuid()
        if @_execute_callbacks?
            @_execute_callbacks.push(uuid)
        else
            @_execute_callbacks = [uuid]
        @call
            multi_response : true
            message        : message.codemirror_execute_code
                id           : uuid
                code         : opts.code
                data         : opts.data
                preparse     : opts.preparse
                session_uuid : @session_uuid
            cb : opts.cb

        if opts.cb?
            salvus_client.execute_callbacks[uuid] = opts.cb

    _remove_execute_callbacks: () =>
        if @_execute_callbacks?
            for uuid in @_execute_callbacks
                delete salvus_client.execute_callbacks[uuid]
            delete @_execute_callbacks

    introspect_line: (opts) =>
        opts = defaults opts,
            line     : required
            preparse : true
            cb       : required

        @call
            message: message.codemirror_introspect
                line         : opts.line
                preparse     : opts.preparse
                session_uuid : @session_uuid
            cb : opts.cb

    ui_synced: (synced) =>
        if synced
            if @_ui_synced_timer?
                clearTimeout(@_ui_synced_timer)
                delete @_ui_synced_timer
            @element.find(".salvus-editor-codemirror-not-synced").hide()
            #@element.find(".salvus-editor-codemirror-synced").show()
        else
            if @_ui_synced_timer?
                return
            show_spinner = () =>
                @element.find(".salvus-editor-codemirror-not-synced").show()
                #@element.find(".salvus-editor-codemirror-synced").hide()
            @_ui_synced_timer = setTimeout(show_spinner, 8*@opts.sync_interval)

    init_cursorActivity_event: () =>
        @codemirror.on 'cursorActivity', (instance) =>
            @send_cursor_info_to_hub_soon()
            @editor.local_storage('cursor', @codemirror.getCursor())

    init_chat: () =>
        chat = @element.find(".salvus-editor-codemirror-chat")
        input = chat.find(".salvus-editor-codemirror-chat-input")

        # send chat message
        input.keydown (evt) =>
            if evt.which == 13 # enter
                content = $.trim(input.val())
                if content != ""
                    input.val("")
                    @write_chat_mesg(content)
                return false

        @chat_session.on 'sync', @render_chat_log

        @render_chat_log()  # first time
        @init_chat_toggle()
        @new_chat_indicator(false)

    write_chat_mesg: (content, cb) =>
        s = misc.to_json(new Date())
        chat = misc.to_json
            name : account.account_settings.fullname()
            color: account.account_settings.account_id().slice(0,6)
            date : s.slice(1, s.length-1)
            mesg : {event:'chat', content:content}
        @chat_session.live(@chat_session.live() + "\n" + chat)
        # save to disk after each message
        @chat_session.save(cb)

    init_chat_toggle: () =>
        title = @element.find(".salvus-editor-chat-title")
        title.click () =>
            if @editor._chat_is_hidden? and @editor._chat_is_hidden
                @show_chat_window()
            else
                @hide_chat_window()
        @hide_chat_window()  #start hidden for now, until we have a way to save this state.

    show_chat_window: () =>
        # SHOW the chat window
        @editor._chat_is_hidden = false
        @element.find(".salvus-editor-chat-show").hide()
        @element.find(".salvus-editor-chat-hide").show()
        @element.find(".salvus-editor-codemirror-input-box").removeClass('col-sm-12').addClass('col-sm-9')
        @element.find(".salvus-editor-codemirror-chat-column").show()
        # see http://stackoverflow.com/questions/4819518/jquery-ui-resizable-does-not-support-position-fixed-any-recommendations
        # if you want to try to make this resizable
        @new_chat_indicator(false)
        @editor.show()  # updates editor width
        @render_chat_log()

    hide_chat_window: () =>
        # HIDE the chat window
        @editor._chat_is_hidden = true
        @element.find(".salvus-editor-chat-hide").hide()
        @element.find(".salvus-editor-chat-show").show()
        @element.find(".salvus-editor-codemirror-input-box").removeClass('col-sm-9').addClass('col-sm-12')
        @element.find(".salvus-editor-codemirror-chat-column").hide()
        @editor.show()  # update size/display of editor (especially the width)

    new_chat_indicator: (new_chats) =>
        # Show a new chat indicatorif new_chats=true
        # if new_chats=true, indicate that there are new chats
        # if new_chats=false, don't indicate new chats.
        elt = @element.find(".salvus-editor-chat-new-chats")
        elt2 = @element.find(".salvus-editor-chat-no-new-chats")
        if new_chats
            elt.show()
            elt2.hide()
        else
            elt.hide()
            elt2.show()

    render_chat_log: () =>
        messages = @chat_session.live()
        if not @_last_size?
            @_last_size = messages.length

        if @_last_size != messages.length
            @new_chat_indicator(true)
            @_last_size = messages.length
            if not @editor._chat_is_hidden
                f = () =>
                    @new_chat_indicator(false)
                setTimeout(f, 3000)

        if @editor._chat_is_hidden
            # For this right here, we need to use the database to determine if user has seen all chats.
            # But that is a nontrivial project to implement, so save for later.   For now, just start
            # assuming user has seen them.

            # done -- no need to render anything.
            return

        output = @element.find(".salvus-editor-codemirror-chat-output")
        output.empty()

        messages = messages.split('\n')

        if not @_max_chat_length?
            @_max_chat_length = 100

        if messages.length > @_max_chat_length
            output.append($("<a style='cursor:pointer'>(#{messages.length - @_max_chat_length} chats omited)</a><br>"))
            output.find("a:first").click (e) =>
                @_max_chat_length += 100
                @render_chat_log()
                output.scrollTop(0)
            messages = messages.slice(messages.length - @_max_chat_length)

        for m in messages
            if $.trim(m) == ""
                continue
            try
                mesg = JSON.parse(m)
            catch
                continue # skip
            date = new Date(mesg.date)
            entry = templates.find(".salvus-chat-entry").clone()
            output.append(entry)
            header = entry.find(".salvus-chat-header")
            if (not last_chat_name?) or last_chat_name != mesg.name or ((date.getTime() - last_chat_time) > 60000)
                header.find(".salvus-chat-header-name").text(mesg.name).css(color:"#"+mesg.color)
                header.find(".salvus-chat-header-date").attr('title', date.toISOString()).timeago()
            else
                header.hide()
            last_chat_name = mesg.name
            last_chat_time = new Date(mesg.date).getTime()
            entry.find(".salvus-chat-entry-content").text(mesg.mesg.content).mathjax()

        output.scrollTop(output[0].scrollHeight)

    send_cursor_info_to_hub: () =>
        delete @_waiting_to_send_cursor
        if not @session_uuid # not yet connected to a session
            return
        @broadcast_cursor_pos(@codemirror.getCursor())

    send_cursor_info_to_hub_soon: () =>
        if @_waiting_to_send_cursor?
            return
        @_waiting_to_send_cursor = setTimeout(@send_cursor_info_to_hub, @opts.cursor_interval)


    # Move the cursor with given color to the given pos.
    draw_other_cursor: (pos, color, name, patch_moved_cursor) =>
        if not @codemirror?
            return
        if not @_cursors?
            @_cursors = {}
        id = color + name
        cursor_data = @_cursors[id]
        if not cursor_data?
            cursor = templates.find(".salvus-editor-codemirror-cursor").clone().show()
            inside = cursor.find(".salvus-editor-codemirror-cursor-inside")
            inside.css
                'background-color': color
            label = cursor.find(".salvus-editor-codemirror-cursor-label")
            label.css('color':color)
            label.text(name)
            cursor_data = {cursor: cursor, pos:pos}
            @_cursors[id] = cursor_data
        else
            cursor_data.pos = pos

        if not patch_moved_cursor  # only restart cursor fade out if user initiated.
            # first fade the label out
            cursor_data.cursor.find(".salvus-editor-codemirror-cursor-label").stop().show().animate(opacity:1).fadeOut(duration:16000)
            # Then fade the cursor out (a non-active cursor is a waste of space).
            cursor_data.cursor.stop().show().animate(opacity:1).fadeOut(duration:60000)
        #console.log("Draw #{name}'s #{color} cursor at position #{pos.line},#{pos.ch}", cursor_data.cursor)
        @codemirror.addWidget(pos, cursor_data.cursor[0], false)

    _save: (cb) =>
        if @editor.opts.delete_trailing_whitespace
            omit_lines = {}
            for k, x of @other_cursors
                omit_lines[x.line] = true
            @codemirror.delete_trailing_whitespace(omit_lines:omit_lines)
        super(cb)

    _apply_changeObj: (changeObj) =>
        @codemirror.replaceRange(changeObj.text, changeObj.from, changeObj.to)
        if changeObj.next?
            @_apply_changeObj(changeObj.next)

    refresh_soon: (wait) =>
        if not wait?
            wait = 1000
        if @_refresh_soon?
            # We have already set a timer to do a refresh soon.
            #console.log("not refresh_soon since -- We have already set a timer to do a refresh soon.")
            return
        do_refresh = () =>
            delete @_refresh_soon
            @codemirror.refresh()
        @_refresh_soon = setTimeout(do_refresh, wait)

    interrupt: () =>
        @close_on_action()

    close_on_action: (element) =>
        # Close popups (e.g., introspection) that are set to be closed when an
        # action, such as "execute", occurs.
        if element?
            if not @_close_on_action_elements?
                @_close_on_action_elements = [element]
            else
                @_close_on_action_elements.push(element)
        else if @_close_on_action_elements?
            for e in @_close_on_action_elements
                e.remove()
            @_close_on_action_elements = []

{ MARKERS, FLAGS, ACTION_FLAGS } = diffsync

class SynchronizedWorksheet extends SynchronizedDocument
    constructor: (@editor, @opts) ->
        if not @opts.history_browser
            opts0 =
                cursor_interval : @opts.cursor_interval
                sync_interval   : @opts.sync_interval
            super @editor, opts0, () =>
                @process_sage_updates()

            @init_worksheet_buttons()
            @on 'sync', @process_sage_updates

        @codemirror = @editor.codemirror

        @editor.on 'show', (height) =>
            w = @cm_lines().width()
            for mark in @codemirror.getAllMarks()
                elt = @elt_at_mark(mark)
                if elt?
                    if elt.hasClass('sagews-output')
                        # Setting the max height was mainly to deal with Codemirror< 3.14 bugs.
                        #elt.css('max-height', (height*.9) + 'px')
                        elt.css('width', (w-25) + 'px')
                    else if elt.hasClass('sagews-input')
                        elt.css('width', w + 'px')

        @codemirror.on 'beforeChange', (instance, changeObj) =>
            #console.log("beforeChange: #{misc.to_json(changeObj)}")
            if changeObj.origin == 'paste'
                changeObj.cancel()
                # WARNING: The Codemirror manual says "Note: you may not do anything
                # from a "beforeChange" handler that would cause changes to the
                # document or its visualization."  I think this is OK below though
                # since we just canceled the change.
                @remove_cell_flags_from_changeObj(changeObj, ACTION_FLAGS)
                @_apply_changeObj(changeObj)
                @process_sage_updates()
                @sync()

    init_worksheet_buttons: () =>
        buttons = @element.find(".salvus-editor-codemirror-worksheet-buttons")
        buttons.show()
        buttons.find("a").tooltip(delay:{ show: 500, hide: 100 })
        buttons.find("a[href=#execute]").click () =>
            @action(execute:true, advance:true)
            return false
        buttons.find("a[href=#toggle-input]").click () =>
            @action(execute:false, toggle_input:true)
            return false
        buttons.find("a[href=#toggle-output]").click () =>
            @action(execute:false, toggle_output:true)
            return false
        buttons.find("a[href=#delete-output]").click () =>
            @action(execute:false, delete_output:true)
            return false
        buttons.find("a[href=#interrupt]").click () =>
            @interrupt()
            return false
        buttons.find("a[href=#tab]").click () =>
            @editor.press_tab_key(@editor.codemirror_with_last_focus)
            return false
        buttons.find("a[href=#kill]").click () =>
            @kill()
            return false

    _is_dangerous_undo_step: (cm, changes) =>
        for c in changes
            if c.from.line == c.to.line
                line = cm.getLine(c.from.line)
                if line? and line.length > 0 and (line[0] == MARKERS.output or line[0] == MARKERS.cell)
                    return true
            for t in c.text
                if MARKERS.output in t or MARKERS.cell in t
                    return true
        return false

    on_undo: (cm, changeObj) =>
        u = cm.getHistory().undone
        if u.length > 0 and @_is_dangerous_undo_step(cm, u[u.length-1].changes)
            cm.undo()

    on_redo: (cm, changeObj) =>
        u = cm.getHistory().done
        if u.length > 0 and @_is_dangerous_undo_step(cm, u[u.length-1].changes)
            cm.redo()

    interrupt: () =>
        @close_on_action()
        @send_signal(signal:2)

    kill: () =>
        @close_on_action()
        # Set any running cells to not running.
        for marker in @codemirror.getAllMarks()
            if marker.type == MARKERS.cell
                for flag in ACTION_FLAGS
                    @remove_cell_flag(marker, flag)
        @process_sage_updates()
        @send_signal(signal:3)
        setTimeout(( () => @send_signal(signal:9) ), 500 )


    send_signal: (opts) =>
        opts = defaults opts,
            signal : 2
            cb     : undefined
        if not @session_uuid?
            opts.cb("session_uuid must be set before sending a signal")
            return
        @call
            message: message.codemirror_send_signal
                signal : opts.signal
                session_uuid : @session_uuid
            cb : (err) =>
                @sync()
                setTimeout( (() => @sync()), 50 )
                opts.cb?(err)

    introspect: () =>
        if @opts.history_browser
            return
        # TODO: obviously this wouldn't work in both sides of split worksheet.
        pos  = @codemirror.getCursor()
        line = @codemirror.getLine(pos.line).slice(0, pos.ch)
        if pos.ch == 0 or line[pos.ch-1] in ")]}'\"\t "
            if @editor.opts.spaces_instead_of_tabs
                @codemirror.tab_as_space()
            else
                CodeMirror.commands.defaultTab(@codemirror)
            return
        @introspect_line
            line : line
            cb   : (err, mesg) =>
                if err
                    alert_message(type:"error", message:"Unable to introspect -- #{err}")
                else if mesg.event == "error"
                    alert_message(type:"error", message:"Unable to introspect -- #{mesg.error}")
                else
                    from = {line:pos.line, ch:pos.ch - mesg.target.length}
                    elt = undefined
                    switch mesg.event
                        when 'introspect_completions'
                            @codemirror.showCompletions
                                from             : from
                                to               : pos
                                completions      : mesg.completions
                                target           : mesg.target
                                completions_size : @editor.opts.completions_size

                        when 'introspect_docstring'
                            elt = @codemirror.showIntrospect
                                from      : from
                                content   : mesg.docstring
                                target    : mesg.target
                                type      : "docstring"

                        when 'introspect_source_code'
                            elt = @codemirror.showIntrospect
                                from      : from
                                content   : mesg.source_code
                                target    : mesg.target
                                type      : "source-code"

                        else
                            console.log("BUG -- introspect_line -- unknown event #{mesg.event}")
                    if elt?
                        @close_on_action(elt)

    elt_at_mark: (mark) =>
        elt = mark.replacedWith
        if elt?
            return $(elt)

    cm_wrapper: () =>
        if @_cm_wrapper?
            return @_cm_wrapper
        return @_cm_wrapper = $(@codemirror.getWrapperElement())

    cm_lines: () =>
        if @_cm_lines?
            return @_cm_lines
        return @_cm_lines = @cm_wrapper().find(".CodeMirror-lines")

    pad_bottom_with_newlines: (n) =>
        if @opts.history_browser
            return
        cm = @codemirror
        m = cm.lineCount()
        if m <= 13  # don't bother until worksheet gets big
            return
        j = m-1
        while j >= 0 and j >= m-n and cm.getLine(j).length == 0
            j -= 1
        k = n - (m - (j + 1))
        if k > 0
            cursor = cm.getCursor()
            cm.replaceRange(Array(k+1).join('\n'), {line:m+1, ch:0} )
            cm.setCursor(cursor)

    process_sage_updates: (start) =>
        #console.log("processing Sage updates")
        # For each line in the editor (or starting at line start), check if the line
        # starts with a cell or output marker and is not already marked.
        # If not marked, mark it appropriately, and possibly process any
        # changes to that line.
        cm = @codemirror
        if not start?
            start = 0

        @pad_bottom_with_newlines(10)

        for line in [start...cm.lineCount()]
            x = cm.getLine(line)

            if x[0] == MARKERS.cell
                marks = cm.findMarksAt({line:line, ch:1})
                if marks.length == 0
                    @mark_cell_start(line)
                else
                    first = true
                    for mark in marks
                        if not first # there should only be one mark
                            mark.clear()
                            continue
                        first = false
                        # The mark should only span one line:
                        #   insertions when applying a patch can unfortunately mess this up,
                        #   so we have to re-do any that accidentally span multiple lines.
                        m = mark.find()
                        if m.from.line != m.to.line
                            mark.clear()
                            @mark_cell_start(line)
                flagstring = x.slice(37, x.length-1)
                mark = cm.findMarksAt({line:line, ch:1})[0]
                # It's possible mark isn't defined above, in case of some weird file corruption (say
                # intentionally by the user).  That's why we have "mark?" in the condition below.
                if mark? and flagstring != mark.flagstring
                    if not mark.flagstring?
                        mark.flagstring = ''
                    # only do something if the flagstring changed.
                    if not @opts.history_browser
                        elt = @elt_at_mark(mark)
                        if FLAGS.execute in flagstring
                            elt.data('execute',FLAGS.execute)
                            g = () ->  #ugly use of closure -- ok for now -- TODO: clean up
                                # execute requested
                                elt0 = elt
                                f = () ->
                                    if elt0.data('execute') not in ['done', FLAGS.running]
                                        elt0.spin(true)
                                setTimeout(f, 1000)
                            g()
                        else if FLAGS.running in flagstring
                            elt.data('execute',FLAGS.running)
                            g = () ->   #ugly use of closure -- ok for now -- TODO: clean up
                                elt0 = elt
                                f = () ->
                                    if elt0.data('execute') not in ['done', FLAGS.execute]
                                        elt0.spin(color:'green')
                                # code is running on remote local hub.
                                setTimeout(f, 1000)
                            g()
                        else
                            elt.data('execute','done')
                            # code is not running
                            elt.spin(false)
                    if FLAGS.hide_input in flagstring and FLAGS.hide_input not in mark.flagstring
                        @hide_input(line)
                    else if FLAGS.hide_input in mark.flagstring and FLAGS.hide_input not in flagstring
                        @show_input(line)

                    if FLAGS.hide_output in flagstring and FLAGS.hide_output not in mark.flagstring
                        @hide_output(line)
                    else if FLAGS.hide_output in mark.flagstring and FLAGS.hide_output not in flagstring
                        @show_output(line)

                    mark.flagstring = flagstring

            else if x[0] == MARKERS.output
                marks = cm.findMarksAt({line:line, ch:1})
                if marks.length == 0
                    @mark_output_line(line)
                mark = cm.findMarksAt({line:line, ch:1})[0]
                uuid = cm.getRange({line:line,ch:1}, {line:line,ch:37})
                if mark.uuid != uuid # uuid changed -- completely new output
                    #console.log("uuid change: new x = ", x)
                    mark.processed = 38
                    mark.uuid = uuid
                    @elt_at_mark(mark).html('')
                if mark.processed < x.length
                    #console.log("length change; x = ", x)
                    # new output to process
                    t = x.slice(mark.processed, x.length-1)
                    mark.processed = x.length
                    for s in t.split(MARKERS.output)
                        if s.length > 0
                            output = @elt_at_mark(mark)
                            # appearance of output shows output (bad design?)
                            output.removeClass('sagews-output-hide')
                            try
                               @process_output_mesg(mesg:JSON.parse(s), element:output)
                            catch e
                                log("BUG: error rendering output: '#{s}' -- #{e}")

            else if x.indexOf(MARKERS.output) != -1
                #console.log("correcting merge/paste issue with output marker line (line=#{line})")
                ch = x.indexOf(MARKERS.output)
                cm.replaceRange('\n', {line:line, ch:ch})
                @process_sage_updates(line)
                return

            else if x.indexOf(MARKERS.cell) != -1
                #console.log("correcting merge/paste issue with cell marker (line=#{line})")
                ch = x.indexOf(MARKERS.cell)
                cm.replaceRange('\n', {line:line, ch:ch})
                @process_sage_updates(line)
                return

    ##################################################################################
    # Toggle visibility of input/output portions of cells -
    #    This is purely a client-side display function; it doesn't change
    #    the document or cause any sync to happen!
    ##################################################################################

    # hide_input: hide input part of cell that has start marker at the given line.
    hide_input: (line) =>
        end = line+1
        cm = @codemirror
        while end < cm.lineCount()
            c = cm.getLine(end)[0]
            if c == MARKERS.cell or c == MARKERS.output
                break
            end += 1

        line += 1

        #hide = $("<div>")
        opts =
            shared         : false
            inclusiveLeft  : true
            inclusiveRight : true
            atomic         : true
            #replacedWith   : hide[0]
            collapsed      : true   # yeah, collapsed now works right in CodeMirror 3.14
        marker = cm.markText({line:line, ch:0}, {line:end-1, ch:cm.getLine(end-1).length}, opts)
        marker.type = 'hide_input'
        @editor.show()

    show_input: (line) =>
        cm = @codemirror
        for marker in cm.findMarksAt({line:line+1, ch:0})
            if marker.type == 'hide_input'
                marker.clear()
                @editor.show()

    hide_output: (line) =>
        mark = @find_output_mark(line)
        if mark?
            @elt_at_mark(mark).addClass('sagews-output-hide')
            @editor.show()

    show_output: (line) =>
        mark = @find_output_mark(line)
        if mark?
            @elt_at_mark(mark).removeClass('sagews-output-hide')
            @editor.show()

    execute_code: (opts) ->
        opts = defaults opts,
            code     : required
            cb       : undefined
            data     : undefined
            preparse : true
            uuid     : undefined

        if opts.uuid?
            uuid = opts.uuid
        else
            uuid = misc.uuid()

        if opts.cb?
            salvus_client.execute_callbacks[uuid] = opts.cb

        @call
            multi_response : true
            message        : message.codemirror_execute_code
                session_uuid : @session_uuid
                id           : uuid
                code         : opts.code
                data         : opts.data
                preparse     : opts.preparse

        return uuid

    interact: (output, desc) =>
        # Create and insert DOM objects corresponding to the interact
        elt = $("<div class='sagews-output-interact'>")
        interact_elt = $("<span>")
        elt.append(interact_elt)
        output.append(elt)

        # Call jQuery plugin to make it all happen.
        interact_elt.sage_interact(desc:desc, execute_code:@execute_code, process_output_mesg:@process_output_mesg)

    jump_to_output_matching_jquery_selector: (selector) =>
        cm = @codemirror
        for x in cm.getAllMarks()
            t = $(x.replacedWith).find(selector)
            if t.length > 0
                cm.scrollIntoView(x.find().from)
                return

    process_html_output: (e) =>
        e.find("table").addClass('table')   # makes bootstrap tables look MUCH nicer
        a = e.find('a')
        a.attr("target","_blank") # make all links open in a new tab
        that = @
        for x in a
            y = $(x)
            if y.attr('href')?[0] == '#'  # target is internal anchor to id
                y.click (t) ->
                    that.jump_to_output_matching_jquery_selector($(t.target).attr('href'))
                    return false

    process_output_mesg: (opts) =>
        opts = defaults opts,
            mesg    : required
            element : required
            mark     : undefined
        mesg = opts.mesg
        output = opts.element
        # mesg = object
        # output = jQuery wrapped element

        if mesg.clear? and mesg.clear
            output.empty()

        if mesg.stdout?
            output.append($("<span class='sagews-output-stdout'>").text(mesg.stdout))

        if mesg.stderr?
            output.append($("<span class='sagews-output-stderr'>").text(mesg.stderr))

        if mesg.html?
            e = $("<span class='sagews-output-html'>").html(mesg.html).mathjax()
            output.append(e)
            @process_html_output(e)

        if mesg.interact?
            @interact(output, mesg.interact)

        if mesg.md?
            # markdown
            x = misc_page.markdown_to_html(mesg.md)
            t = $('<span class="sagews-output-md">').html(x.s)
            if x.has_mathjax
                t.mathjax()
            output.append(t)
            @process_html_output(t)

        if mesg.tex?
            # latex
            val = mesg.tex
            elt = $("<div class='sagews-output-tex'>")
            arg = {tex:val.tex}
            if val.display
                arg.display = true
            else
                arg.inline = true
            output.append(elt.mathjax(arg))

        if mesg.file?
            val = mesg.file
            if not val.show? or val.show
                if val.url?
                    target = val.url
                else
                    target = "#{window.salvus_base_url}/blobs/#{val.filename}?uuid=#{val.uuid}"
                switch misc.filename_extension(val.filename)
                    # TODO: harden DOM creation below?
                    when 'webm'
                        video = $("<video src='#{target}' class='sagews-output-video' preload controls loop>")
                        output.append(video)

                    when 'svg', 'png', 'gif', 'jpg'
                        img = $("<img src='#{target}' class='sagews-output-image'>")
                        output.append(img)

                        if mesg.events?
                            img.css(cursor:'crosshair')
                            location = (e) ->
                                offset = img.offset()
                                x = (e.pageX - offset.left) /img.width()
                                y = (e.pageY - offset.top) /img.height()
                                return [x,y]

                            exec = (code) =>
                                @execute_code
                                    code     :code
                                    preparse : true
                                    cb       : (mesg) =>
                                        delete mesg.done
                                        @process_output_mesg
                                            mesg    : mesg
                                            element : output

                            for event, function_name of mesg.events
                                img.data("salvus-events-#{event}", function_name)
                                switch event
                                    when 'click'
                                        img.click (e) =>
                                            p = location(e)
                                            exec("#{img.data('salvus-events-click')}('click',(#{p}))")
                                    when 'mousemove'
                                        ignore_mouse_move = undefined
                                        last_pos = undefined
                                        img.mousemove (e) =>
                                            if ignore_mouse_move?
                                                return
                                            ignore_mouse_move = true
                                            setTimeout( ( () => ignore_mouse_move=undefined ), 100 )
                                            p = location(e)
                                            if last_pos? and p[0] == last_pos[0] and p[1] == last_pos[1]
                                                return
                                            last_pos = p
                                            exec("#{img.data('salvus-events-mousemove')}('mousemove',(#{p}))")
                                    else
                                        console.log("unknown or unimplemented event -- #{event}")

                    else
                        output.append($("<a href='#{target}' class='sagews-output-link' target='_new'>#{val.filename} (this temporary link expires in a minute)</a> "))

        if mesg.javascript? and @editor.opts.allow_javascript_eval
            (() =>
             cell      = new Cell(output : opts.element)
             worksheet = new Worksheet(@)
             print     = (s...) -> opts.element.append($("<div></div>").text("#{s.join(' ')}"))

             code = mesg.javascript.code
             if mesg.javascript.coffeescript
                 code = CoffeeScript.compile(code)
             if mesg.obj?
                 obj  = JSON.parse(mesg.obj)

             # The eval below is an intentional cross-site scripting vulnerability in the fundamental design of Salvus.
             # Note that there is an allow_javascript document option, which (at some point) users
             # will be able to set.  There is one more instance of eval below in _receive_broadcast.
             eval(code)
            )()

        if mesg.done? and mesg.done
            output.removeClass('sagews-output-running')
            output.addClass('sagews-output-done')

        @refresh_soon()

    _receive_broadcast: (mesg) =>
        switch mesg.mesg.event
            when 'execute_javascript'
                if @editor.opts.allow_javascript_eval
                    mesg = mesg.mesg
                    (() =>
                         worksheet = new Worksheet(@)
                         cell      = new Cell(cell_id : mesg.cell_id)
                         print     = (s...) -> console.log("#{s.join(' ')}") # doesn't make sense, but better than printing to printer...
                         code = mesg.code
                         if mesg.coffeescript
                             code = CoffeeScript.compile(code)
                         obj = JSON.parse(mesg.obj)
                         eval(code)
                    )()


    mark_cell_start: (line) =>
        # Assuming the proper text is in the document for a new cell at this line,
        # mark it as such. This hides control codes and places a cell separation
        # element, which may be clicked to create a new cell.
        cm  = @codemirror
        if line >= cm.lineCount()-1
            # If at bottom, insert blank lines.
            cm.replaceRange("\n\n\n", {line:line+1, ch:0})
        x   = cm.getLine(line)
        end = x.indexOf(MARKERS.cell, 1)
        input = cell_start_template.clone().css
            width : @cm_lines().width() + 'px'

        input.click () =>
            f = () =>
                @insert_new_cell(mark.find().from.line)
            if IS_MOBILE
                # It is way too easy to accidentally click on the insert new cell line on mobile.
                bootbox.confirm "Create new cell?", (result) =>
                    if result
                        f()
                    else # what the user really wants...
                        cm.focus()
                        cm.setCursor({line:mark.find().from.line+1, ch:0})
            else
                f()
            return false

        opts =
            shared         : false
            inclusiveLeft  : false
            inclusiveRight : true
            atomic         : true
            replacedWith   : input[0]
        mark = cm.markText({line:line, ch:0}, {line:line, ch:end+1}, opts)
        mark.type = MARKERS.cell
        return mark

    mark_output_line: (line) =>
        # Assuming the proper text is in the document for output to be displayed at this line,
        # mark it as such.  This hides control codes and creates a div into which output will
        # be placed as it appears.

        cm = @codemirror

        # WARNING: Having a max-height that is SMALLER than the containing codemirror editor was *critical*
        # before Codemirror 3.14, due to a bug.
        output = output_template.clone().css
            width        : (@cm_lines().width()-25) + 'px'
            #'max-height' : (.9*@cm_wrapper().height()) + 'px'


        if cm.lineCount() < line + 2
            cm.replaceRange('\n', {line:line+1,ch:0})
        start = {line:line, ch:0}
        end = {line:line, ch:cm.getLine(line).length}
        opts =
            shared         : false
            inclusiveLeft  : false
            inclusiveRight : true
            atomic         : true
            replacedWith   : output[0]
        mark = cm.markText(start, end, opts)
        # mark.processed stores how much of the output line we
        # have processed  [marker]36-char-uuid[marker]
        mark.processed = 38
        mark.uuid = cm.getRange({line:line, ch:1}, {line:line, ch:37})
        mark.type = MARKERS.output

        # Double click output to toggle input
        output.dblclick () =>
            @action(pos:{line:mark.find().from.line-1, ch:0}, toggle_input:true)

        return mark

    find_output_line: (line) =>
        # Given a line number in the editor, return the nearest (greater or equal) line number that
        # is an output line, or undefined if there is no output line before the next cell.
        cm = @codemirror
        if cm.getLine(line)[0] == MARKERS.output
            return line
        line += 1
        while line < cm.lineCount() - 1
            x = cm.getLine(line)
            if x.length > 0
                if x[0] == MARKERS.output
                    return line
                if x[0] == MARKERS.cell
                    return undefined
            line += 1
        return undefined

    find_output_mark: (line) =>
        # Same as find_output_line, but returns the actual mark (or undefined).
        n = @find_output_line(line)
        if n?
            for mark in @codemirror.findMarksAt({line:n, ch:0})
                if mark.type == MARKERS.output
                    return mark
        return undefined

    # Returns start and end lines of the current input block (if line is undefined),
    # or of the block that contains the given line number.
    current_input_block: (line) =>
        cm = @codemirror
        if not line?
            line = cm.getCursor().line

        start = line
        end   = line
        while start > 0
            x = cm.getLine(start)
            if x.length > 0 and x[0] == MARKERS.cell
                break
            start -= 1
        while end < cm.lineCount()-1
            x = cm.getLine(end)
            if x.length > 0 and x[0] == MARKERS.cell
                end -= 1
                break
            end += 1
        return {start:start, end:end}

    action: (opts={}) =>
        opts = defaults opts,
            pos     : undefined # if given, use this pos; otherwise, use where cursor is or all cells in selection
            advance : false
            split   : false # split cell at cursor (selection is ignored)
            execute : false # if false, do whatever else we would do, but don't actually execute code.
            toggle_input  : false  # if true; toggle whether input is displayed; ranges all toggle same as first
            toggle_output : false  # if true; toggle whether output is displayed; ranges all toggle same as first
            delete_output : false  # if true; delete all the the output in the range
            cm      : @codemirror
        if opts.pos?
            pos = opts.pos
        else
            if opts.cm.somethingSelected() and not opts.split
                opts.advance = false
                start = opts.cm.getCursor('start').line
                end   = opts.cm.getCursor('end').line
                # Expand both ends of the selection to contain cell containing cursor
                start = @current_input_block(start).start
                end   = @current_input_block(end).end

                # These @_toggle attributes are used to ensure that we toggle all the input and output
                # view states so they end up the same.
                @_toggle_input_range  = 'wait'
                @_toggle_output_range = 'wait'

                # For each line in the range, check if it is the beginning of a cell; if so do the action on it.
                for line in [start..end]  # include end
                    x = opts.cm.getLine(line)
                    if x? and x[0] == MARKERS.cell
                        opts.pos = {line:line, ch:0}
                        @action(opts)

                delete @_toggle_input_range
                delete @_toggle_output_range
                return
            else
                pos = opts.cm.getCursor()

        @close_on_action()  # close introspect popups

        if opts.split
            @split_cell_at(pos)
            if opts.execute
                opts.split = false
                opts.advance = false
                opts.cm.setCursor(line:pos.line, ch:0)
                @action(opts)
                @move_cursor_to_next_cell()
                @action(opts)
            else
                @sync()
            return

        if opts.delete_output
            n = @find_output_line(pos.line)
            if n?
                #opts.cm.removeLine(n)
                opts.cm.replaceRange('',{line:n,ch:0},{line:n+1,ch:0})
                @sync()
            return

        block = @current_input_block(pos.line)

        # create or get cell start mark
        {marker, created} = @cell_start_marker(block.start)
        if created  # we added a new line when creating start marker
            block.end += 1

        if opts.toggle_input
            if FLAGS.hide_input in @get_cell_flagstring(marker)
                # input is currently hidden
                if @_toggle_input_range != 'hide'
                    @remove_cell_flag(marker, FLAGS.hide_input)   # show input
                if @_toggle_input_range == 'wait'
                    @_toggle_input_range = 'show'
            else
                # input is currently shown
                if @_toggle_input_range != 'show'
                    @set_cell_flag(marker, FLAGS.hide_input)  # hide input
                if @_toggle_input_range == 'wait'
                    @_toggle_input_range = 'hide'

            @sync()

        if opts.toggle_output
            if FLAGS.hide_output in @get_cell_flagstring(marker)
                # output is currently hidden
                if @_toggle_output_range != 'hide'
                    @remove_cell_flag(marker, FLAGS.hide_output)  # show output
                if @_toggle_output_range == 'wait'
                    @_toggle_output_range = 'show'
            else
                if @_toggle_output_range != 'show'
                    @set_cell_flag(marker, FLAGS.hide_output)
                if @_toggle_output_range == 'wait'
                    @_toggle_output_range = 'hide'

            @sync()

        if opts.advance
            block.end = @move_cursor_to_next_cell()

        if opts.execute
            # check for client-side rendering
            start = block.start
            # skip blank lines and the input uuid line:
            while start <= block.end
                s = @codemirror.getLine(start).trim()
                if s.length == 0 or s[0] == MARKERS.cell
                    start += 1
                else
                    # check if it is a mode line.
                    mode_line = s.replace(/\s/g,'').toLowerCase()
                    if mode_line in CLIENT_SIDE_MODE_LINES
                        @execute_cell_client_side
                            block     : {start:start, end:block.end}
                            mode_line : mode_line
                            marker    : marker
                        return
                    break

            @set_cell_flag(marker, FLAGS.execute)
            # sync (up to a certain number of times) until either computation happens or is acknowledged.
            # Just successfully calling sync could return and mean that a sync started before this computation
            # started had completed.
            wait = 50
            f = () =>
                if FLAGS.execute in @get_cell_flagstring(marker)
                    @sync () =>
                        wait = wait*1.2
                        if wait < 15000
                            setTimeout(f, wait)
            @sync () =>
                setTimeout(f, 50)

    # purely client-side markdown rendering for a markdown block -- an optimization
    execute_cell_client_side: (opts) =>
        opts = defaults opts,
            block     : required
            mode_line : required
            marker    : required
        cm = @codemirror
        block = opts.block

        # get the input text -- after the mode line
        input = cm.getRange({line:block.start+1,ch:0}, {line:block.end+1,ch:0})
        i = input.indexOf(MARKERS.output)
        if i != -1
            input              = input.slice(0,i)
            has_output_already = true
        else
            has_output_already = false

        # generate new uuid, so that other clients will re-render output.
        output_uuid        = misc.uuid()

        # determine the mode
        i = opts.mode_line.indexOf('(')
        if i == -1
            mode = opts.mode_line.slice(1)
        else
            mode = opts.mode_line.slice(1,i)
        hide = false
        if mode in ['html', 'md'] and opts.mode_line.indexOf('false') == -1
            hide = true

        # create corresponding output line: this is important since it ensures that all clients will *see* the new output too
        mesg = {}
        if mode == 'javascript'
            mesg['javascript'] = {code: input}
        else if mode == 'coffeescript'
            mesg['javascript'] = {coffeescript:true, code:input}
        else
            mesg[mode] = input
        output_line = MARKERS.output + output_uuid + MARKERS.output + misc.to_json(mesg) + MARKERS.output + '\n'
        if has_output_already
            cm.replaceRange(output_line, {line:block.end,ch:0},   {line:block.end+1,ch:0})
        else
            cm.replaceRange(output_line, {line:block.end+1,ch:0}, {line:block.end+1,ch:0})

        # hide input if necessary
        if hide
            @set_cell_flag(opts.marker, FLAGS.hide_input)
        else
            @remove_cell_flag(opts.marker, FLAGS.hide_input)

        # update so that client sees rendering
        @process_sage_updates()
        @sync()

    split_cell_at: (pos) =>
        # Split the cell at the given pos.
        @cell_start_marker(pos.line)
        @sync()

    # returns the line number where the previous cell ends
    move_cursor_to_next_cell: () =>
        cm = @codemirror
        line = cm.getCursor().line + 1
        while line < cm.lineCount()
            x = cm.getLine(line)
            if x.length > 0 and x[0] == MARKERS.cell
                cm.setCursor(line:line+1, ch:0)
                return line-1
            line += 1
        # there is no next cell, so we create one at the last non-whitespace line
        while line > 0 and $.trim(cm.getLine(line)).length == 0
            line -= 1
        @cell_start_marker(line+1)
        cm.setCursor(line:line+2, ch:0)
        return line

    ##########################################
    # Codemirror-based cell manipulation code
    #   This is tightly tied to codemirror, so only makes sense on the client.
    ##########################################
    get_cell_flagstring: (marker) =>
        pos = marker.find()
        return @codemirror.getRange({line:pos.from.line,ch:37},{line:pos.from.line, ch:pos.to.ch-1})

    set_cell_flagstring: (marker, value) =>
        pos = marker.find()
        @codemirror.replaceRange(value, {line:pos.from.line,ch:37}, {line:pos.to.line, ch:pos.to.ch-1})

    get_cell_uuid: (marker) =>
        pos = marker.find()
        return @codemirror.getLine(pos.line).slice(1,38)

    set_cell_flag: (marker, flag) =>
        s = @get_cell_flagstring(marker)
        if flag not in s
            @set_cell_flagstring(marker, flag + s)

    remove_cell_flag: (marker, flag) =>
        s = @get_cell_flagstring(marker)
        if flag in s
            s = s.replace(new RegExp(flag, "g"), "")
            @set_cell_flagstring(marker, s)

    insert_new_cell: (line) =>
        pos = {line:line, ch:0}
        @codemirror.replaceRange('\n', pos)
        @codemirror.focus()
        @codemirror.setCursor(pos)
        @cell_start_marker(line)
        @process_sage_updates()
        @sync()

    cell_start_marker: (line) =>
        cm = @codemirror
        x = cm.findMarksAt(line:line, ch:1)
        if x.length > 0 and x[0].type == MARKERS.cell
            # already properly marked
            return {marker:x[0], created:false}
        if cm.lineCount() < line + 2
            cm.replaceRange('\n',{line:line+1,ch:0})
        uuid = misc.uuid()
        cm.replaceRange(MARKERS.cell + uuid + MARKERS.cell + '\n', {line:line, ch:0})
        return {marker:@mark_cell_start(line), created:true}

    remove_cell_flags_from_changeObj: (changeObj, flags) =>
        # Remove cell flags from *contiguous* text in the changeObj.
        # This is useful for cut/copy/paste, but useless for
        # diffsync (where we would not use it anyways).
        # This function modifies changeObj in place.
        @remove_cell_flags_from_text(changeObj.text, flags)
        if changeObj.next?
            @remove_cell_flags_from_changeObj(changeObj.next, flags)

    remove_cell_flags_from_text: (text, flags) =>
        # !! The input "text" is an array of strings, one for each line;
        # this function modifies this array in place.
        # Replace all lines of the form
        #    [MARKERS.cell][36-character uuid][flags][MARKERS.cell]
        # by
        #    [MARKERS.cell][uuid][flags2][MARKERS.cell]
        # where flags2 has the flags in the second argument (an array) removed,
        # or all flags removed if the second argument is undefined
        for i in [0...text.length]
            s = text[i]
            if s.length >= 38 and s[0] == MARKERS.cell
                if flags?
                    text[i] = s.slice(0,37) + (x for x in s.slice(37,s.length-1) when x not in flags) + MARKERS.cell
                else
                    text[i] = s.slice(0,37) + MARKERS.cell


class Cell
    constructor : (opts) ->
        @opts = defaults opts,
            output  : undefined # jquery wrapped output area
            cell_id : undefined
        @output = opts.output
        @cell_id = opts.cell_id

class Worksheet
    constructor : (@worksheet) ->
        @project_page = @worksheet.editor.editor.project_page
        @editor = @worksheet.editor.editor

    execute_code: (opts) =>
        if typeof opts == "string"
            opts = {code:opts}
        @worksheet.execute_code(opts)

    interrupt: () =>
        @worksheet.interrupt()

    kill: () =>
        @worksheet.kill()

    set_interact_var : (opts) =>
        elt = @worksheet.element.find("#" + opts.id)
        if elt.length == 0
            log("BUG: Attempt to set var of interact with id #{opts.id} failed since no such interact known.")
        else
            i = elt.data('interact')
            if not i?
                log("BUG: interact with id #{opts.id} doesn't have corresponding data object set.", elt)
            else
                i.set_interact_var(opts)

    del_interact_var : (opts) =>
        elt = @worksheet.element.find("#" + opts.id)
        if elt.length == 0
            log("BUG: Attempt to del var of interact with id #{opts.id} failed since no such interact known.")
        else
            i = elt.data('interact')
            if not i?
                log("BUG: interact with id #{opts.id} doesn't have corresponding data object del.", elt)
            else
                i.del_interact_var(opts.name)

################################
exports.SynchronizedDocument = SynchronizedDocument
exports.SynchronizedWorksheet = SynchronizedWorksheet
