###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

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
CONNECT_TIMEOUT_S = 45  # Sage (hence sage worksheets) can take a long time to start up.
DEFAULT_TIMEOUT   = 45

log = (s) -> console.log(s)

diffsync = require('diffsync')

MAX_SAVE_TIME_S = diffsync.MAX_SAVE_TIME_S

misc     = require('smc-util/misc')
{defaults, required} = misc

misc_page = require('./misc_page')

message  = require('smc-util/message')
markdown = require('./markdown')

# Define interact jQuery plugins - used only by sage worksheets
require('./interact')

{salvus_client} = require('./salvus_client')
{alert_message} = require('./alerts')

async = require('async')

templates = $("#salvus-editor-templates")

account = require('./account')

{redux} = require('./smc-react')

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
            cm.patchApply(p)

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
            project_id        : required
            filename          : required
            sync_interval     : 1000    # no matter what, we won't send sync messages back to the server more frequently than this (in ms)
            revision_tracking : false     # if true, save every change in @.filename.sage-history
            cb                : required   # cb(err) once doc has connected to hub first time and got session info; will in fact keep trying until success

        @project_id = @opts.project_id   # must also be set by derived classes that don't call this constructor!
        @filename   = @opts.filename
        #@connect = @_connect
        @connect = misc.retry_until_success_wrapper
            f         : @_connect
            max_delay : 7000
            max_tries : 2
            max_time  : 30000
        ##@connect    = misc.retry_until_success_wrapper(f:@_connect)#, logname:'connect')

        @sync = misc.retry_until_success_wrapper(f:@_sync, min_interval:4*@opts.sync_interval, max_time:MAX_SAVE_TIME_S*1000, max_delay:5000)
        @save = misc.retry_until_success_wrapper(f:@_save, min_interval:4*@opts.sync_interval, max_time:MAX_SAVE_TIME_S*1000, max_delay:5000)

        #console.log("connect: constructor")
        @connect (err) =>
            opts.cb(err, @)

    _connect: (cb) =>
        throw Error('define _connect in derived class')

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

    # @live(): the current live version of this document as a DiffSyncDoc or string, or
    # @live(s): set the live version
    live: (s) =>
        if s?
            @dsync_client.live = s
        else
            return @dsync_client?.live

    # "sync(cb)": keep trying to synchronize until success; then do cb()
    # _sync(cb) -- try once to sync; on any error cb(err).
    _sync: (cb) =>
        @_presync?()
        before = @live()
        if before? and before.string?
            before = before.string()
        #console.log("_sync, live='#{before}'")
        if not @dsync_client?
            cb("must be connected before syncing"); return
        @dsync_client.push_edits (err) =>
            if err
                if typeof(err)=='string' and err.indexOf('retry') != -1
                    # This is normal -- it's because the diffsync algorithm only allows sync with
                    # one client (and upstream) at a time.
                    cb?(err)
                else if err == 'reloading'
                    cb?(err)
                else  # all other errors should reconnect first.
                    #console.log("connect: due to sync error: #{err}")
                    @connect () =>
                        cb?(err)
                #console.log("_sync: error -- #{err}")
            else
                # Emit event that indicates document changed as
                # a result of sync; it's critical to do this even
                # if we're not done syncing, since it's used, e.g.,
                # by Sage worksheets to render special codes.
                @emit('sync')

                s = @live()
                if not s?
                    cb?()  # doing sync with this object is over... unwind with grace.
                    return
                if s.copy?
                    s = s.copy()
                @_last_sync = s    # What was the last successful sync with upstream.

                after = @live()
                if after.string?
                    after = after.string()
                if before != after
                    #console.log("change during sync so doing again")
                    cb?("file changed during sync")
                    return

                # success!
                #console.log("_sync: success")
                cb?()

    # save(cb): write out file to disk retrying until success = worked *and* what was saved to
    # disk eq... or cb(err) if failed a lot.
    # _save(cb): try to sync then write to disk; if anything goes wrong, cb(err).
    #         if success, does cb()
    _save: (cb) =>
        #console.log("returning fake save error"); cb?("fake saving error"); return
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
                    else if resp.event == 'error'
                        cb(resp.error)
                    else if resp.event == 'success' or resp.event == 'codemirror_wrote_to_disk'
                        @_post_save_success?()
                        if not resp.hash?
                            console.log("_save: please restart your project server to get updated hash support")
                            cb(); return
                        if resp.hash?
                            live = @live()
                            if not live?  # file closed in the meantime
                                cb(); return
                            if live.string?
                                live = live.string()
                            hash = misc.hash_string(live)
                            # console.log("_save: remote hash=#{resp.hash}; local hash=#{hash}")
                            if hash != resp.hash
                                cb("file changed during save")
                            else
                                cb()
                    else
                        cb("unknown response type #{misc.to_json(resp)}")

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
        s = redux.getStore('account')
        mesg =
            event              : 'cursor'
            pos                : pos
            name               : s.get_first_name()
            color              : s.get_color()
            patch_moved_cursor : @_patch_moved_cursor
        @send_broadcast_message(mesg, false)
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
        @draw_other_cursor(mesg.mesg.pos, '#' + mesg.mesg.color, mesg.mesg.name, mesg.mesg.patch_moved_cursor)

    draw_other_cursor: (pos, color, name) =>
        # overload this in derived class

    file_path: () =>
        if not @_file_path?
            @_file_path = misc.path_split(@filename).head
        return @_file_path

synchronized_string = (opts) ->
    new SynchronizedString(opts)

exports.synchronized_string = synchronized_string

class SynchronizedDocument extends AbstractSynchronizedDoc
    codemirrors: () =>
        v = [@codemirror]
        if @editor._split_view
            v.push(@codemirror1)
        return v

    focused_codemirror: () =>
        @editor.focused_codemirror()

    _sync: (cb) =>
        if not @dsync_client?
            cb("not initialized")
            return
        @editor.activity_indicator()
        super(cb)

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
                output_uuid  : opts.output_uuid
                session_uuid : @session_uuid
            cb : opts.cb

        if opts.cb?
            salvus_client.execute_callbacks[uuid] = opts.cb

    _remove_execute_callbacks: () =>
        if @_execute_callbacks?
            for uuid in @_execute_callbacks
                delete salvus_client.execute_callbacks[uuid]
            delete @_execute_callbacks

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

    init_chat: () =>
        chat = @element.find(".salvus-editor-codemirror-chat")
        input = chat.find(".salvus-editor-codemirror-chat-input")

        # send chat message
        input.keydown (evt) =>
            if evt.which == 13 # enter
                content = $.trim(input.val())
                if content != ""
                    input.val("")
                    @write_chat_message
                        event_type : "chat"
                        payload    : {content : content}
                return false

        @chat_session.on('sync', (=>@render_chat_log()))

        @render_chat_log()  # first time
        @init_chat_toggle()
        @init_video_toggle()
        @new_chat_indicator(false)


    # This is an interface that allows messages to be passed between connected
    # clients via a log in the filesystem. These messages are handled on all
    # clients through the render_chat_log() method, which listens to the 'sync'
    # event emitted by the chat_session object.
    write_chat_message: (opts={}) =>

        opts = defaults opts,
            event_type : required  # "chat", "start_video", "stop_video"
            payload    : required  # event-dependent dictionary
            cb         : undefined # callback

        new_message = misc.to_json
            sender_id : redux.getStore('account').get_account_id()
            date      : new Date()
            event     : opts.event_type
            payload   : opts.payload

        @chat_session.live(@chat_session.live() + "\n" + new_message)

        # save to disk after each message
        @chat_session.save(opts.cb)

    init_chat_toggle: () =>
        title = @element.find(".salvus-editor-chat-title-text")
        title.click () =>
            if @editor._chat_is_hidden? and @editor._chat_is_hidden
                @show_chat_window()
            else
                @hide_chat_window()
        if @editor._chat_is_hidden
            @hide_chat_window()
        else
            @show_chat_window()

    show_chat_window: () =>
        # SHOW the chat window
        @editor._chat_is_hidden = false
        @editor.local_storage("chat_is_hidden", false)
        @element.find(".salvus-editor-chat-show").hide()
        @element.find(".salvus-editor-chat-hide").show()
        @element.find(".salvus-editor-codemirror-input-box").removeClass('col-sm-12').addClass('col-sm-9')
        @element.find(".salvus-editor-codemirror-chat-column").show()
        # see http://stackoverflow.com/questions/4819518/jquery-ui-resizable-does-not-support-position-fixed-any-recommendations
        # if you want to try to make this resizable
        @new_chat_indicator(false)
        @editor.show()  # updates editor width
        @editor.emit 'show-chat'
        @render_chat_log()


    hide_chat_window: () =>
        # HIDE the chat window
        @editor._chat_is_hidden = true
        @editor.local_storage("chat_is_hidden", true)
        @element.find(".salvus-editor-chat-hide").hide()
        @element.find(".salvus-editor-chat-show").show()
        @element.find(".salvus-editor-codemirror-input-box").removeClass('col-sm-9').addClass('col-sm-12')
        @element.find(".salvus-editor-codemirror-chat-column").hide()
        @editor.show()  # update size/display of editor (especially the width)
        @editor.emit 'hide-chat'

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

    # This handles every event in a chat log.
    render_chat_log: () =>
        if not @chat_session?
            # try again in a few seconds -- not done loading
            setTimeout(@render_chat_log, 5000)
            return
        messages = @chat_session.live()
        if not messages?
            # try again in a few seconds -- not done loading
            setTimeout(@render_chat_log, 5000)
            return
        chat_hash = misc.hash_string(messages)
        if not @_last_chat_hash?
            @_last_chat_hash = chat_hash
        else if @_last_chat_hash != chat_hash
            @_last_chat_hash = chat_hash
            @new_chat_indicator(true)
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

        # The chat message area
        chat_output = @element.find(".salvus-editor-codemirror-chat-output")

        messages = messages.split('\n')

        @_max_chat_length ?= 100

        if messages.length > @_max_chat_length
            chat_output.append($("<a style='cursor:pointer'>(#{messages.length - @_max_chat_length} chats omited)</a><br>"))
            chat_output.find("a:first").click (e) =>
                @_max_chat_length += 100
                @render_chat_log()
                chat_output.scrollTop(0)
            messages = messages.slice(messages.length - @_max_chat_length)

        # Preprocess all inputs to add a 'sender_name' field to all messages
        # with a 'sender_id'. Also, keep track of whether or not video should
        # be displayed
        all_messages = []
        sender_ids = []
        for m in messages
            if $.trim(m) == ""
                continue
            try
                new_message = JSON.parse(m)
            catch e
                continue # skip

            all_messages.push(new_message)

            if new_message.sender_id?
                sender_ids.push(new_message.sender_id)

        salvus_client.get_usernames
            account_ids : sender_ids
            cb          : (err, sender_names) =>
                if err
                    console.log("Error getting user namees -- ", err)
                else
                    # Clear the chat output
                    chat_output.empty()

                    # Use handler to render each message
                    last_mesg = undefined
                    for mesg in all_messages

                        if mesg.sender_id?
                            user_info = sender_names[mesg.sender_id]
                            mesg.sender_name = user_info.first_name + " " +
                                user_info.last_name
                        else if mesg.name?
                            mesg.sender_name = mesg.name

                        if mesg.event?
                            switch mesg.event
                                when "chat"
                                    @handle_chat_text_message(mesg, last_mesg)
                                when "start_video"
                                    @handle_chat_start_video(mesg)
                                    video_chat_room_id = mesg.room_id
                                when "stop_video"
                                    @handle_chat_stop_video(mesg)
                        else # handle old-style log messages (chat only)
                            @handle_old_chat_text_message(mesg, last_mesg)

                        last_mesg = mesg

                    chat_output.scrollTop(chat_output[0].scrollHeight)

                    if @editor._video_is_on? and @editor._video_is_on
                        @start_video(video_chat_room_id)
                    else
                        @stop_video()

    handle_old_chat_text_message: (mesg, last_mesg) =>

        entry = templates.find(".salvus-chat-entry").clone()

        header = entry.find(".salvus-chat-header")

        sender_name = mesg.sender_name

        # Assign a fixed color to the sender's ID
        message_color = mesg.color

        date = new Date(mesg.date)
        if last_mesg?
            last_date = new Date(last_mesg.date)

        if not last_mesg? or
          last_mesg.sender_name != mesg.sender_name or
          (date.getTime() - last_date.getTime()) > 60000

            header.find(".salvus-chat-header-name")
              .text(mesg.name)
              .css(color: "#" + mesg.color)
            header.find(".salvus-chat-header-date")
              .attr("title", date.toISOString())
              .timeago()

        else
            header.hide()

        entry.find(".salvus-chat-entry-content")
          .html(markdown.markdown_to_html(mesg.mesg.content).s)
          .mathjax()

        chat_output = @element.find(".salvus-editor-codemirror-chat-output")
        chat_output.append(entry)

    handle_chat_text_message: (mesg, last_mesg) =>

        entry = templates.find(".salvus-chat-entry").clone()
        header = entry.find(".salvus-chat-header")

        sender_name = mesg.sender_name

        # Assign a fixed color to the sender's ID
        message_color = mesg.sender_id.slice(0, 6)

        date = new Date(mesg.date)
        if last_mesg?
            last_date = new Date(last_mesg.date)

        if not last_mesg? or
          last_mesg.sender_id != mesg.sender_id or
          (date.getTime() - last_date.getTime()) > 60000

            header.find(".salvus-chat-header-name")
              .text(sender_name)
              .css(color: "#" + message_color)
            header.find(".salvus-chat-header-date")
              .attr("title", date.toISOString())
              .timeago()
        else
            header.hide()

        entry.find(".salvus-chat-entry-content")
          .html(markdown.markdown_to_html(mesg.payload.content).s)
          .mathjax()

        chat_output = @element.find(".salvus-editor-codemirror-chat-output")
        chat_output.append(entry)

    handle_chat_start_video: (mesg) =>

        console.log("Start video message detected: " + mesg.payload.room_id)

        entry = templates.find(".salvus-chat-activity-entry").clone()
        header = entry.find(".salvus-chat-header")

        sender_name = mesg.sender_name

        # Assign a fixed color to the sender's ID
        message_color = mesg.sender_id.slice(0, 6)

        date = new Date(mesg.date)
        if last_mesg?
            last_date = new Date(last_mesg.date)

        if not last_mesg? or
          last_mesg.sender_id != mesg.sender_id or
          (date.getTime() - last_date.getTime()) > 60000

            header.find(".salvus-chat-header-name")
              .text(sender_name)
              .css(color: "#" + message_color)
            header.find(".salvus-chat-header-date")
              .attr("title", date.toISOString())
              .timeago()
        else
            header.hide()

        header.find(".salvus-chat-header-activity")
          .html(" started a video chat")

        chat_output = @element.find(".salvus-editor-codemirror-chat-output")
        chat_output.append(entry)

        @editor._video_is_on = true
        @editor.local_storage("video_is_on", true)
        @element.find(".salvus-editor-chat-video-is-off").hide()
        @element.find(".salvus-editor-chat-video-is-on").show()

    handle_chat_stop_video: (mesg) =>

        console.log("Stop video message detected: " + mesg.payload.room_id)

        entry = templates.find(".salvus-chat-activity-entry").clone()
        header = entry.find(".salvus-chat-header")

        sender_name = mesg.sender_name

        # Assign a fixed color to the sender's ID
        message_color = mesg.sender_id.slice(0, 6)

        date = new Date(mesg.date)
        if last_mesg?
            last_date = new Date(last_mesg.date)

        if not last_mesg? or
          last_mesg.sender_id != mesg.sender_id or
          (date.getTime() - last_date.getTime()) > 60000

            header.find(".salvus-chat-header-name")
              .text(sender_name)
              .css(color: "#" + message_color)
            header.find(".salvus-chat-header-date")
              .attr("title", date.toISOString())
              .timeago()
        else
            header.hide()

        header.find(".salvus-chat-header-activity")
          .html(" ended a video chat")

        chat_output = @element.find(".salvus-editor-codemirror-chat-output")
        chat_output.append(entry)

        @editor._video_is_on = false
        @editor.local_storage("video_is_on", false)
        @element.find(".salvus-editor-chat-video-is-on").hide()
        @element.find(".salvus-editor-chat-video-is-off").show()


    start_video: (room_id) =>
        video_height = "232px"
        @editor._video_chat_room_id = room_id

        video_container = @element.find(".salvus-editor-codemirror-chat-video")
        video_container.empty()
        video_container.html("
            <iframe id=#{room_id} src=\"/static/webrtc/group_chat_side.html?#{room_id}\" height=\"#{video_height}\">
            </iframe>
            ")

        # Update heights of chat and video windows
        @editor.emit 'show-chat'

    stop_video: () =>
        video_container = @element.find(".salvus-editor-codemirror-chat-video")
        video_container.empty()

        # Update heights of chat and video windows
        @editor.emit 'show-chat'

    init_video_toggle: () =>

        video_button = @element.find(".salvus-editor-chat-title-video")
        video_button.click () =>
            if not @editor._video_is_on
                @start_video_chat()
            else
                @stop_video_chat()

        @editor._video_is_on = false

    start_video_chat: () =>

        @_video_chat_room_id = Math.floor(Math.random()*1e24 + 1e5)
        @write_chat_message
            "event_type" : "start_video"
            "payload"    : {room_id: @_video_chat_room_id}

    stop_video_chat: () =>

        @write_chat_message
            "event_type" : "stop_video"
            "payload"    : {room_id: @_video_chat_room_id}

    send_cursor_info_to_hub: () =>
        delete @_waiting_to_send_cursor
        if not @session_uuid # not yet connected to a session
            return
        if @editor.codemirror_with_last_focus?
            @broadcast_cursor_pos(@editor.codemirror_with_last_focus.getCursor())

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
            for cm in [@codemirror, @codemirror1]
                cm?.refresh()
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

underscore = require('underscore')

class SynchronizedString extends AbstractSynchronizedDoc
    constructor: (opts) ->
        @opts = defaults opts,
            project_id        : required
            filename          : required
            sync_interval     : 1000       # TODO: ignored right now -- no matter what, we won't send sync messages back to the server more frequently than this (in ms)
            cb                : required   # cb(err) once doc has connected to hub first time and got session info; will in fact keep trying
        @project_id  = @opts.project_id
        @filename    = @opts.filename
        @connect     = @_connect
        @_syncstring = salvus_client.sync_string
            project_id    : @project_id
            path          : @filename

        @_syncstring.once 'change', =>
            @emit('connect')   # successful connection
            opts.cb(undefined, @)

        @_syncstring.on 'change', => # only when change is external
            @emit('sync')

    live: (s) =>
        if s?
            @_syncstring.set(s)
            @emit('sync')
        else
            return @_syncstring.get()

    sync: (cb) =>
        @_syncstring.save(cb)

    _connect: (cb) =>
        # no op
        cb?()

    _save: (cb) =>
        async.series [@_syncstring.save, @_syncstring.save_to_disk], (err) =>
            if err
                cb(err)
            else if @_syncstring.has_unsaved_changes()
                cb("unsaved changes")
            else
                cb()

    save: (cb) =>
        misc.retry_until_success
            f           : @_save
            start_delay : 3000
            max_time    : 30000
            max_delay   : 10000
            cb          : cb

    #TODO: replace disconnect_from_session by close in our API
    disconnect_from_session: =>
        @close()

    close: =>
        if @_closed
            return
        @_syncstring.close()
        @removeAllListeners()
        @_closed = true

class SynchronizedDocument2 extends SynchronizedDocument
    constructor: (@editor, opts, cb) ->
        @opts = defaults opts,
            cursor_interval   : 1000  # ignored below right now
            sync_interval     : 1000     # never send sync messages upstream more often than this

        window.s = @

        @project_id  = @editor.project_id
        @filename    = @editor.filename
        @connect     = @_connect
        @editor.save = @save
        @codemirror  = @editor.codemirror
        @codemirror1 = @editor.codemirror1
        @element     = @editor.element

        @_users = smc.redux.getStore('users')  # todo -- obviously not like this...

        @_other_cursor_timeout_s = 30  # only show active other cursors for this long

        @editor._set("Loading...")
        @codemirror.setOption('readOnly', true)
        @codemirror1.setOption('readOnly', true)
        id = require('smc-util/schema').client_db.sha1(@project_id, @filename)
        @_syncstring = salvus_client.sync_string
            id         : id
            project_id : @project_id
            path       : @filename

        #important to debounce since above hash/getValue grows linearly in size of document

        update_unsaved_changes = underscore.debounce((=>@_update_unsaved_changes()), 700)
        @editor.has_unsaved_changes(false) # start by assuming no unsaved changes...
        dbg = salvus_client.dbg("SynchronizedDocument2(path='#{@filename}')")
        dbg("waiting for first change")
        @_syncstring.once 'init', (err) =>
            if err
                @editor._set(err)
                return
            @editor._set(@_syncstring.get())
            @codemirror.setOption('readOnly', false)
            @codemirror1.setOption('readOnly', false)
            @codemirror.clearHistory()  # ensure that the undo history doesn't start with "empty document"
            @codemirror1.clearHistory()

            update_unsaved_changes()
            @_udpate_read_only()

            @_init_cursor_activity()

            @_syncstring.on 'change', =>
                #dbg("got upstream syncstring change: '#{misc.trunc_middle(@_syncstring.get(),400)}'")
                @codemirror.setValueNoJump(@_syncstring.get())
                @emit('sync')

            @_syncstring.on 'metadata-change', =>
                update_unsaved_changes()
                @_udpate_read_only()

            save_state = () => @_sync()
            @save_state_debounce = underscore.debounce(save_state, @opts.sync_interval)

            @codemirror.on 'change', (instance, changeObj) =>
                #console.log("change event when live='#{@live().string()}'")
                if changeObj.origin? and changeObj.origin != 'setValue'
                    @save_state_debounce()
                else
                    # hack to ignore cursor movements resulting from remote changes
                    @_last_remote_change = new Date()
                update_unsaved_changes()

            @emit('connect')   # successful connection
            cb?()  # done initializing document (this is used, e.g., in the SynchronizedWorksheet derived class).

        synchronized_string
            project_id    : @project_id
            filename      : misc.meta_file(@filename, 'chat')
            cb            : (err, chat_session) =>
                if not err  # err actually can't happen, since we retry until success...
                    @chat_session = chat_session
                    @init_chat()

    _has_unsaved_changes: =>
        if not @codemirror?
            return false
        return @_syncstring.hash_of_saved_version() != misc.hash_string(@codemirror.getValue())

    _update_unsaved_changes: =>
        @editor.has_unsaved_changes(@_has_unsaved_changes())

    _udpate_read_only: =>
        @editor.set_readonly_ui(@_syncstring.get_read_only())

    _sync: (cb) =>
        @_syncstring.set(@codemirror.getValue())
        @_syncstring.save(cb)

    sync: (cb) =>
        @_sync(cb)

    _connect: (cb) =>
        # no op
        cb?()

    _save: (cb) =>
        @_syncstring.set(@codemirror.getValue())
        async.series [@_syncstring.save, @_syncstring.save_to_disk], (err) =>
            if err
                cb(err)
            else if @_has_unsaved_changes()
                cb("unsaved changes")
            else
                @_post_save_success?()  # hook so that derived classes can do things, e.g., make blobs permanent
                cb()

    save: (cb) =>
        cm = @focused_codemirror()
        if @editor.opts.delete_trailing_whitespace
            omit_lines = {}
            for k, x of @other_cursors
                omit_lines[x.line] = true
            cm.delete_trailing_whitespace(omit_lines:omit_lines)
        misc.retry_until_success
            f           : @_save
            start_delay : 3000
            max_time    : 30000
            max_delay   : 10000
            cb          : cb

    _init_cursor_activity: () =>
        for i, cm of [@codemirror, @codemirror1]
            cm.on 'cursorActivity', (cm) =>
                # This is an ugly hack to ignore cursor movements resulting from remote changes.
                caused = not @_last_remote_change? or @_last_remote_change - new Date() != 0
                # broadcast cursor positions
                locs = ({x:c.anchor.ch, y:c.anchor.line} for c in cm.listSelections())
                @_syncstring.set_cursor_locs(locs, caused)
                # save primary cursor position to local storage for next time
                #console.log("setting cursor#{cm.name} to #{misc.to_json(cm.getCursor())}")
                @editor.local_storage("cursor#{cm.name}", cm.getCursor())

        @_syncstring.on 'cursor_activity', (account_id) =>
            @_render_other_cursor(account_id)

    _render_other_cursor: (account_id) =>
        if account_id == salvus_client.account_id
            # nothing to do -- we don't draw our own cursor via this
            return
        x = @_syncstring.get_cursors()?.get(account_id)
        #console.log("_render_other_cursor", x?.get('time'), misc.seconds_ago(@_other_cursor_timeout_s))
        # important: must use server time to compare, not local time.
        if salvus_client.server_time() - x?.get('time') <= @_other_cursor_timeout_s*1000
            locs = x.get('locs')?.toJS()
            if locs?
                #console.log("draw cursors for #{account_id} at #{misc.to_json(locs)} expiring after #{@_other_cursor_timeout_s}s")
                @draw_other_cursors(account_id, locs, x.get('caused'))

    # Move the cursor with given color to the given pos.
    draw_other_cursors: (account_id, locs, caused) =>
        # ensure @_cursors is defined; this is map from key to ...?
        @_cursors ?= {}
        x = @_cursors[account_id]
        if not x?
            x = @_cursors[account_id] = []
        # First draw/update all current cursors
        for [i, loc] in misc.enumerate(locs)
            pos   = {line:loc.y, ch:loc.x}
            data  = x[i]
            name  = misc.trunc(@_users.get_first_name(account_id), 10)
            color = @_users.get_color(account_id)
            if not data?
                if not caused
                    # don't create non user-caused cursors
                    continue
                data = x[i] = {cursor: templates.find(".smc-editor-codemirror-cursor").clone().show()}
            if name != data.name
                data.cursor.find(".smc-editor-codemirror-cursor-label").text(name)
                data.name = name
            if color != data.color
                data.cursor.find(".smc-editor-codemirror-cursor-inside").css('border-left': "1px solid #{color}")
                data.cursor.find(".smc-editor-codemirror-cursor-label" ).css(color: color)
                data.color = color

            # Place cursor in the editor in the right spot
            @codemirror.addWidget(pos, data.cursor[0], false)

            if caused  # if not user caused will have been fading already from when created
                # Update cursor fade-out
                # LABEL: first fade the label out over 8s
                data.cursor.find(".smc-editor-codemirror-cursor-label").stop().animate(opacity:1).show().fadeOut(duration:8000)
                # CURSOR: then fade the cursor out (a non-active cursor is a waste of space) over 15s.
                data.cursor.find(".smc-editor-codemirror-cursor-inside").stop().animate(opacity:1).show().fadeOut(duration:15000)

        if x.length > locs.length
            # Next remove any cursors that are no longer there (e.g., user went from 5 cursors to 1)
            for i in [locs.length...x.length]
                #console.log('removing cursor ', i)
                x[i].cursor.remove()
            @_cursors[account_id] = x.slice(0, locs.length)

    #TODO: replace disconnect_from_session by close in our API
    disconnect_from_session: =>
        @close()

    close: =>
        if @_closed
            return
        @_syncstring?.close()
        @chat_session?.close()
        # TODO -- this doesn't work...
        for cm in [@codemirror, @codemirror1]
            cm.setOption("mode", "text/x-csrc")
            cmElem = cm.getWrapperElement()
            cmElem.parentNode.removeChild(cmElem)
        delete @codemirror
        delete @codemirror1
        delete @editor.codemirror
        delete @editor.codemirror1
        @_closed = true


################################
exports.SynchronizedDocument  = SynchronizedDocument
exports.SynchronizedDocument2 = SynchronizedDocument2
