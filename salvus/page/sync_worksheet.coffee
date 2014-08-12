###
Synchronized Worksheets (see also syncdoc.coffee for synchronized CodeMirror documents)

###


log = (s) -> console.log(s)

diffsync = require('diffsync')

misc     = require('misc')
{defaults, required} = misc

message  = require('message')

{salvus_client} = require('salvus_client')
{alert_message} = require('alerts')

templates = $("#salvus-editor-templates")

##################################################################################
#
#
##################################################################################


class DiffSyncDoc
    # Define exactly one of worksheet or obj (non-DOM version of a worksheet)
    #     cm     = a live codemirror editor
    #     string = a string
    constructor: (opts) ->
        @opts = defaults opts,
            cm     : undefined
            string : undefined
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
            return @opts.cm.getValue()

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
            console.log("patching string in place")  # should never need to happen
            @opts.string = diffsync.dmp.patch_apply(p, @string())[0]
        else
            cm = @opts.cm

            # We maintain our cursor position using the following trick:
            #    1. Insert a non-used unicode character where the cursor is.
            #    2. Apply the patches.
            #    3. Find the unicode character,, remove it, and put the cursor there.
            #       If the unicode character vanished, just put the cursor at the coordinates
            #       where it used to be (better than nothing).
            # There is a more sophisticated approach described at http://neil.fraser.name/writing/cursor/
            # but it is harder to implement given that we'll have to dive into the details of his
            # patch_apply implementation.  This thing below took only a few minutes to implement.
            scroll = cm.getScrollInfo()

            cursor_anchor = cm.getCursor('anchor')
            cursor_head   = cm.getCursor('head')
            range = not (cursor_anchor.line == cursor_head.line and cursor_anchor.ch == cursor_head.ch)

            c_anchor = "\uFE10"   # chosen from http://billposer.org/Linguistics/Computation/UnicodeRanges.html
                                # since it is (1) undefined, and (2) looks like a cursor..
            if range
                c_head   = "\uFE11"

            cm.replaceRange(c_anchor, cursor_anchor)
            if range
                # Have to put the other symbol on the *outside* of the selection, which depends on
                # on whether anchor is before or after head.
                if cursor_head.line > cursor_anchor.line or (cursor_head.line == cursor_anchor.line and cursor_head.ch >= cursor_anchor.ch)
                    cm.replaceRange(c_head, {line:cursor_head.line, ch:cursor_head.ch+1})
                else
                    cm.replaceRange(c_head, {line:cursor_head.line, ch:cursor_head.ch})

            s = @string()
            new_value = diffsync.dmp.patch_apply(p, s)[0]
            v = new_value.split('\n')

            find_cursor = (pos0, chr) ->
                line  = pos0.line
                B = 5
                # We first try an interval around the cursor, since that is where the cursor is most likely to be.
                for k in [Math.max(0, line-B)...Math.max(0,Math.min(line-B, v.length))].concat([0...v.length])
                    ch = v[k].indexOf(chr)
                    if ch != -1
                        return pos:{line:k, ch:ch}, marker:true
                return pos:pos0, marker:false

            anchor_pos = find_cursor(cursor_anchor, c_anchor)
            if range
                head_pos   = find_cursor(cursor_head, c_head)
            else
                head_pos = anchor_pos

            s = v.join('\n')
            # Benchmarking reveals that this line 'cm.setValue(s)' is by far the dominant time taker.
            # This can be optimized by taking into account the patch itself (and maybe stuff returned
            # when applying it) to instead only change a small range of the editor.  This is TODO
            # for later though.  For reference, a 200,000 line doc on a Samsung chromebook takes < 1s still, and about .4 s
            # on a fast intel laptop.
            cm.setValue(s)
            cm.setSelection(anchor_pos.pos, head_pos.pos)
            # Remove the markers: complicated since can't remove both simultaneously, and
            # removing one impacts position of the other, when in same line.
            pos = undefined
            if anchor_pos.marker
                pos = anchor_pos.pos
                cm.replaceRange("", pos, {line:pos.line, ch:pos.ch+1})
            if range and head_pos.marker
                pos1 = head_pos.pos
                if pos? and pos1.line == pos.line
                    if pos1.ch > pos.ch
                        pos1.ch -= 1
                cm.replaceRange("", pos1, {line:pos1.line, ch:pos1.ch+1})

            cm.scrollTo(scroll.left, scroll.top)
            cm.scrollIntoView(anchor_pos.pos)  # just in case


codemirror_diffsync_client = (cm_session, content) ->
    # This happens on initialization and reconnect.  On reconnect, we could be more
    # clever regarding restoring the cursor and the scroll location.
    cm_session.codemirror.setValueNoJump(content)

    return new diffsync.CustomDiffSync
        doc            : new DiffSyncDoc(cm:cm_session.codemirror)
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
            timeout : 30
            cb      : (err, mesg) =>
                if err
                    cb(err)
                else if mesg.event == 'error'
                    cb(mesg.error)
                else if mesg.event == 'codemirror_diffsync_retry_later'
                    cb('retry')
                else
                    @remote.recv_edits(mesg.edit_stack, mesg.last_version_ack, cb)


class SynchronizedDocument
    constructor: (@editor, opts) ->
        @opts = defaults opts,
            cursor_interval : 150
            sync_interval   : 150
        @editor.save = @save
        @codemirror = @editor.codemirror
        @element    = @editor.element
        @filename   = @editor.filename

        @init_cursorActivity_event()
        @init_chat()

        @codemirror.setOption('readOnly', true)

        @connect (err, resp) =>
            if err
                bootbox.alert "<h3>Unable to open '#{@filename}'</h3>", () =>
                    @editor.editor.close(@filename)
            else
                @codemirror.setOption('readOnly', false)
                @ui_synced(true)
                @editor.init_autosave()
                @sync_soon()  # do a first sync asap.
                @codemirror.on 'change', (instance, changeObj) =>
                    if changeObj.origin? and changeObj.origin != 'setValue'
                        @ui_synced(false)
                        @sync_soon()

    _add_listeners: () =>
        salvus_client.on 'codemirror_diffsync_ready', @_diffsync_ready
        salvus_client.on 'codemirror_bcast', @_receive_broadcast

    _remove_listeners: () =>
        salvus_client.removeListener 'codemirror_diffsync_ready', @_diffsync_ready
        salvus_client.removeListener 'codemirror_bcast', @_receive_broadcast

    disconnect_from_session: (cb) =>
        @_remove_listeners()
        salvus_client.call
            timeout : 10
            message : message.codemirror_disconnect(session_uuid : @session_uuid)
            cb      : cb

        # store pref in localStorage to not auto-open this file next time
        @editor.local_storage('auto_open', false)

    connect: (cb) =>
        @element.find(".salvus-editor-codemirror-loading").show()
        @_remove_listeners()
        salvus_client.call
            timeout : 45     # a reasonable amount of time, since file could be *large*
            message : message.codemirror_get_session
                path         : @filename
                project_id   : @editor.project_id
            cb      : (err, resp) =>
                @element.find(".salvus-editor-codemirror-loading").hide()
                #console.log("new session: ", resp)
                if err
                    cb(err); return
                if resp.event == 'error'
                    cb(resp.event); return

                @session_uuid = resp.session_uuid

                # Render the chat
                @element.find(".salvus-editor-codemirror-chat-output").html('')
                for m in resp.chat
                    @_receive_chat(m)
                @new_chat_indicator(false)  # not necessarily new

                # If our content is already set, we'll end up doing a merge.
                resetting = @_previous_successful_set? and @_previous_successful_set

                if not resetting
                    # very easy
                    @_previous_successful_set = true
                    @editor._set(resp.content)
                    live_content = resp.content
                    # Reset the undo history here, since we do not want it to start with "empty document":
                    @codemirror.clearHistory()
                else
                    # Doing a reset -- apply all the edits to the current version of the document.
                    edit_stack = @dsync_client.edit_stack
                    # Apply our offline edits to the new live version of the document.
                    r = new DiffSyncDoc(string:resp.content)
                    for p in edit_stack
                        r = r.patch(p.edits)

                    # Compute the patch comparing last known shadow
                    # with our current live, and apply that patch to what the server
                    # just sent us.  We declare that to be our new live.
                    patch = @dsync_client.shadow.diff(@dsync_client.live)
                    r2 = r.patch(patch)
                    live_content = r2.string()


                @dsync_client = codemirror_diffsync_client(@, resp.content)
                @dsync_server = new DiffSyncHub(@)
                @dsync_client.connect(@dsync_server)
                @dsync_server.connect(@dsync_client)
                @_add_listeners()

                if resetting
                    @codemirror.setValueNoJump(live_content)
                    # Force a sync.
                    @_syncing = false
                    @sync()

                if not resetting
                    @editor.save_button.addClass('disabled')   # start with no unsaved changes

                cb()

    _diffsync_ready: (mesg) =>
        if mesg.session_uuid == @session_uuid
            @sync_soon()

    call: (opts) =>
        opts = defaults opts,
            message     : required
            timeout     : 45
            cb          : undefined
        opts.message.session_uuid = @session_uuid
        salvus_client.call
            message : opts.message
            timeout : opts.timeout
            cb      : (err, result) =>
                if result? and result.event == 'reconnect'
                    #console.log("codemirror sync session #{@session_uuid}: reconnecting ")
                    do_reconnect = () =>
                        @connect (err) =>
                            if err
                                #console.log("codemirror sync session #{@session_uuid}: failed to reconnect")
                                opts.cb?(err)
                            else
                                #console.log("codemirror sync session #{@session_uuid}: successful reconnect")
                                opts.cb?('reconnect')  # still an error condition
                    setTimeout(do_reconnect, 1000)  # give server some room
                else
                    opts.cb?(err, result)

    sync_soon: (wait) =>
        if not wait?
            wait = @opts.sync_interval
        if @_sync_soon?
            # We have already set a timer to do a sync soon.
            #console.log("not sync_soon since -- We have already set a timer to do a sync soon.")
            return
        do_sync = () =>
            delete @_sync_soon
            @sync (didnt_sync) =>
                if didnt_sync
                    @sync_soon(Math.min(5000, wait*1.5))
        @_sync_soon = setTimeout(do_sync, wait)

    ui_synced: (synced) =>
        if synced
            if @_ui_synced_timer?
                clearTimeout(@_ui_synced_timer)
                delete @_ui_synced_timer
            @element.find(".salvus-editor-codemirror-not-synced").hide()
            @element.find(".salvus-editor-codemirror-synced").show()
        else
            if @_ui_synced_timer?
                return
            show_spinner = () =>
                @element.find(".salvus-editor-codemirror-not-synced").show()
                @element.find(".salvus-editor-codemirror-synced").hide()
            @_ui_synced_timer = setTimeout(show_spinner, 1500)

    sync: (cb) =>    # cb(false if a sync occured; true-ish if anything prevented a sync from happening)
        if @_syncing? and @_syncing
            # can only sync once a complete cycle is done, or declared failure.
            cb?()
            #console.log('skipping since already syncing')
            return

        @_syncing = true
        if @_sync_soon?
            clearTimeout(@_sync_soon)
            delete @_sync_soon
        before = @dsync_client.live.string()
        @dsync_client.push_edits (err) =>
            #console.log("dsync_client result: ", err)
            if err
                @_syncing = false
                if not @_sync_failures?
                    @_sync_failures = 1
                else
                    @_sync_failures += 1
                if @_sync_failures % 6 == 0 and not err == 'retry'
                    alert_message(type:"error", message:"Unable to synchronize '#{@filename}' with server; changes not saved until you next connect to the server.  Do not close your browser (offline mode not yet implemented).")

                setTimeout(@sync, 30000)  # try again soon...
                cb?(err)
            else
                @_sync_failures = 0
                @_syncing = false
                @ui_synced(true)
                cb?()

    init_cursorActivity_event: () =>
        @codemirror.on 'cursorActivity', (instance) =>
            if not @_syncing
                @send_cursor_info_to_hub_soon()
            @editor.local_storage('cursor', @codemirror.getCursor())

    init_chat: () =>
        chat = @element.find(".salvus-editor-codemirror-chat")
        input = chat.find(".salvus-editor-codemirror-chat-input")
        input.keydown (evt) =>
            if evt.which == 13 # enter
                content = $.trim(input.val())
                if content != ""
                    input.val("")
                    @send_broadcast_message({event:'chat', content:content}, true)
                return false

        @init_chat_toggle()

    init_chat_toggle: () =>
        title = @element.find(".salvus-editor-chat-title")
        title.click () =>
            if @editor._chat_is_hidden? and @editor._chat_is_hidden
                @show_chat_window()
            else
                @hide_chat_window()
        @hide_chat_window()  #start hidden for now, until we have a way to save this.

    show_chat_window: () =>
        # SHOW the chat window
        @editor._chat_is_hidden = false
        @element.find(".salvus-editor-chat-show").hide()
        @element.find(".salvus-editor-chat-hide").show()
        @element.find(".salvus-editor-codemirror-input-box").removeClass('col-sm-12').addClass('col-sm-9')
        @element.find(".salvus-editor-codemirror-chat-column").show()
        # see http://stackoverflow.com/questions/4819518/jquery-ui-resizable-does-not-support-position-fixed-any-recommendations
        # if you want to try to make this resizable
        output = @element.find(".salvus-editor-codemirror-chat-output")
        output.scrollTop(output[0].scrollHeight)
        @new_chat_indicator(false)
        @editor.show()  # updates editor width

    hide_chat_window: () =>
        # HIDE the chat window
        @editor._chat_is_hidden = true
        @element.find(".salvus-editor-chat-hide").hide()
        @element.find(".salvus-editor-chat-show").show()
        @element.find(".salvus-editor-codemirror-input-box").removeClass('col-sm-9').addClass('col-sm-12')
        @element.find(".salvus-editor-codemirror-chat-column").hide()
        @editor.show()  # update size/display of editor (especially the width)

    new_chat_indicator: (new_chats) =>
        # Show a new chat indicator of the chat window is closed.
        # if new_chats, indicate that there are new chats
        # if new_chats, don't indicate new chats.
        elt = @element.find(".salvus-editor-chat-new-chats")
        if new_chats and @editor._chat_is_hidden
            elt.show()
        else
            elt.hide()

    _receive_chat: (mesg) =>
        @new_chat_indicator(true)
        output = @element.find(".salvus-editor-codemirror-chat-output")
        date = new Date(mesg.date)
        entry = templates.find(".salvus-chat-entry").clone()
        output.append(entry)
        header = entry.find(".salvus-chat-header")
        if (not @_last_chat_name?) or @_last_chat_name != mesg.name or ((date.getTime() - @_last_chat_time) > 60000)
            header.find(".salvus-chat-header-name").text(mesg.name).css(color:"#"+mesg.color)
            header.find(".salvus-chat-header-date").attr('title', date.toISOString()).timeago()
        else
            header.hide()
        @_last_chat_name = mesg.name
        @_last_chat_time = new Date(mesg.date).getTime()
        entry.find(".salvus-chat-entry-content").text(mesg.mesg.content).mathjax()
        output.scrollTop(output[0].scrollHeight)

    send_broadcast_message: (mesg, self) ->
        m = message.codemirror_bcast
            session_uuid : @session_uuid
            mesg         : mesg
            self         : self    #if true, then also send include this client to receive message
        salvus_client.send(m)

    send_cursor_info_to_hub: () =>
        delete @_waiting_to_send_cursor
        if not @session_uuid # not yet connected to a session
            return
        @send_broadcast_message({event:'cursor', pos:@codemirror.getCursor()})

    send_cursor_info_to_hub_soon: () =>
        if @_waiting_to_send_cursor?
            return
        @_waiting_to_send_cursor = setTimeout(@send_cursor_info_to_hub, @opts.cursor_interval)

    _receive_broadcast: (mesg) =>
        if mesg.session_uuid != @session_uuid
            return
        switch mesg.mesg.event
            when 'cursor'
                @_receive_cursor(mesg)
            when 'chat'
                @_receive_chat(mesg)

    _receive_cursor: (mesg) =>
        # If the cursor has moved, draw it.  Don't bother if it hasn't moved, since it can get really
        # annoying having a pointless indicator of another person.
        if not @_last_cursor_pos?
            @_last_cursor_pos = {}
        else
            pos = @_last_cursor_pos[mesg.color]
            if pos? and pos.line == mesg.mesg.pos.line and pos.ch == mesg.mesg.pos.ch
                return
        # cursor moved.
        @_last_cursor_pos[mesg.color] = mesg.mesg.pos   # record current position
        @_draw_other_cursor(mesg.mesg.pos, '#' + mesg.color, mesg.name)

    # Move the cursor with given color to the given pos.
    _draw_other_cursor: (pos, color, name) =>
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

        # first fade the label out
        cursor_data.cursor.find(".salvus-editor-codemirror-cursor-label").stop().show().animate(opacity:100).fadeOut(duration:8000)
        # Then fade the cursor out (a non-active cursor is a waste of space).
        cursor_data.cursor.stop().show().animate(opacity:100).fadeOut(duration:60000)
        #console.log("Draw #{name}'s #{color} cursor at position #{pos.line},#{pos.ch}", cursor_data.cursor)
        @codemirror.addWidget(pos, cursor_data.cursor[0], false)

    click_save_button: () =>
        if not @save_button.hasClass('disabled')
            @save_button.find('span').text("Saving...")
            spin = setTimeout((() => @save_button.find(".spinner").show()), 100)
            @save (err) =>
                clearTimeout(spin)
                @save_button.find(".spinner").hide()
                @save_button.find('span').text('Save')
                if not err
                    @save_button.addClass('disabled')
                    @has_unsaved_changes(false)
                else
                    alert_message(type:"error", message:"Error saving '#{@filename}' to disk -- #{err}")
        return false

    save: (cb) =>
        if @editor.opts.delete_trailing_whitespace
            @codemirror.delete_trailing_whitespace()
        if @dsync_client?
            @sync () =>
                @call
                    message: message.codemirror_write_to_disk()
                    cb : cb
        else
            cb("Unable to save '#{@filename}' since it is not yet loaded.")

    _apply_changeObj: (changeObj) =>
        @codemirror.replaceRange(changeObj.text, changeObj.from, changeObj.to)
        if changeObj.next?
            @_apply_changeObj(changeObj.next)



exports.SynchronizedDocument = SynchronizedDocument
