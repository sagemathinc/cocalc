###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, 2015, 2016 William Stein
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

{EventEmitter} = require('events')

class AbstractSynchronizedDoc extends EventEmitter
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

    # For testing.  To use on 'foo' do this in some consoles:   smc.editors['foo'].syncdoc.testbot()
    testbot: (opts) =>
        @focused_codemirror().testbot
            n     : opts?.n
            delay : opts?.delay
            f     : @sync

    ###
    The rest of this class is chat functionality.  This will, of course, be factored out.
    ###
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
                    console.warn("Error getting user names -- ", err)
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
        #console.log("Start video message detected: " + mesg.payload.room_id)

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
        #console.log("Stop video message detected: " + mesg.payload.room_id)

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
        # webpacking this here doesn't, because it needs a parameter and webpack only has js file as targets (if rendered to a file)
        # maybe https://github.com/webpack/webpack/issues/536 has some answer some day in the future …
        # TODO make this video chat properly part of the website or get rid of it
        group_chat_url = window.smc_base_url + "/static/webrtc/group_chat_side.html"
        video_container.html("<iframe id='#{room_id}' src='#{group_chat_url}?#{room_id}' height='#{video_height}'></iframe>")

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

underscore = require('underscore')

class SynchronizedString extends AbstractSynchronizedDoc
    constructor: (opts) ->
        @opts = defaults opts,
            project_id        : required
            filename          : required
            sync_interval     : 1000       # TODO: ignored right now -- no matter what, we won't send sync messages back to the server more frequently than this (in ms)
            cursors           : false
            cb                : required   # cb(err) once doc has connected to hub first time and got session info; will in fact keep trying
        @project_id  = @opts.project_id
        @filename    = @opts.filename
        @connect     = @_connect
        @_syncstring = salvus_client.sync_string
            project_id    : @project_id
            path          : @filename
            cursors       : opts.cursors

        @_syncstring.once 'init', =>
            @emit('connect')   # successful connection
            @_syncstring.wait_until_read_only_known (err) =>  # first time open a file, have to look on disk to load it -- this ensures that is done
                opts.cb(err, @)

        @_syncstring.on 'change', => # only when change is external
            @emit('sync')

        @_syncstring.on 'before-change', =>
            @emit('before-change')

    live: (s) =>
        if s? and s != @_syncstring.get()
            @_syncstring.exit_undo_mode()
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
        async.series([@_syncstring.save, @_syncstring.save_to_disk], cb)

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

    has_uncommitted_changes: =>
        return @_syncstring.has_uncommitted_changes()

    has_unsaved_changes: =>
        return @_syncstring.has_unsaved_changes()

    # per-session sync-aware undo
    undo: () =>
        @_syncstring.set(@_syncstring.undo())
        @emit('sync')

    # per-session sync-aware redo
    redo: () =>
        @_syncstring.set(@_syncstring.redo())
        @emit('sync')

    in_undo_mode: () =>
        return @_syncstring.in_undo_mode()

    exit_undo_mode: () =>
        return @_syncstring.exit_undo_mode()

class SynchronizedDocument2 extends SynchronizedDocument
    constructor: (@editor, opts, cb) ->
        @opts = defaults opts,
            cursor_interval : 1000   # ignored below right now
            sync_interval   : 2000   # never send sync messages upstream more often than this

        ## window.cm = @  ## DEBUGGING

        @project_id  = @editor.project_id
        @filename    = @editor.filename
        @connect     = @_connect
        @editor.save = @save
        @codemirror  = @editor.codemirror
        @codemirror1 = @editor.codemirror1
        @element     = @editor.element

        # replace undo/redo by sync-aware versions
        for cm in [@codemirror, @codemirror1]
            cm.undo = @undo
            cm.redo = @redo

        @_users = smc.redux.getStore('users')  # todo -- obviously not like this...

        @_other_cursor_timeout_s = 30  # only show active other cursors for this long

        @editor.show_startup_message("Loading...", 'info')
        @codemirror.setOption('readOnly', true)
        @codemirror1.setOption('readOnly', true)
        id = require('smc-util/schema').client_db.sha1(@project_id, @filename)
        @_syncstring = salvus_client.sync_string
            id         : id
            project_id : @project_id
            path       : @filename
            cursors    : true

        # This is important to debounce since above hash/getValue grows linearly in size of
        # document; also, we debounce instead of throttle, since we don't want to have this
        # slow down the user while they are typing.
        f = () =>
            if @_update_unsaved_uncommitted_changes()
                # Check again in 5s no matter what if there are uncommitted changes, since otherwise
                # there could be a stuck notification saying there are uncommitted changes.
                setTimeout(f, 5000)
        update_unsaved_uncommitted_changes = underscore.debounce(f, 1500)
        @editor.has_unsaved_changes(false) # start by assuming no unsaved changes...
        #dbg = salvus_client.dbg("SynchronizedDocument2(path='#{@filename}')")
        #dbg("waiting for first change")

        @_syncstring.once 'init', (err) =>
            if err
                window.err = err
                if err.code == 'EACCES'
                    err = "You do not have permission to read '#{@filename}'."
                @editor.show_startup_message(err, 'danger')
                return
            # Now wait until read_only is *defined*, so backend file has been opened.
            @_syncstring.wait_until_read_only_known (err) =>
                @editor.show_content()
                @editor._set(@_syncstring.get())
                @codemirror.setOption('readOnly', false)
                @codemirror1.setOption('readOnly', false)
                @codemirror.clearHistory()  # ensure that the undo history doesn't start with "empty document"
                @codemirror1.clearHistory()

                update_unsaved_uncommitted_changes()
                @_update_read_only()

                @_init_cursor_activity()

                @_syncstring.on 'change', =>
                    #dbg("got upstream syncstring change: '#{misc.trunc_middle(@_syncstring.get(),400)}'")
                    @codemirror.setValueNoJump(@_syncstring.get())
                    @emit('sync')

                @_syncstring.on 'metadata-change', =>
                    update_unsaved_uncommitted_changes()
                    @_update_read_only()

                @_syncstring.on 'before-change', =>
                    #console.log("syncstring before change")
                    @_syncstring.set(@codemirror.getValue())

                # TODO: should do this for all editors, but I don't want to conflict with the top down react rewrite,
                # and this is kind of ugly...
                @_syncstring.on "deleted", =>
                    @editor.editor.close(@filename)

                save_state = () => @_sync()
                # We debounce instead of throttle, because we want a single "diff/commit" to correspond
                # a burst of activity, not a bunch of little pieces of that burst.  This is more
                # consistent with how undo stacks work.
                @save_state_debounce = underscore.debounce(save_state, @opts.sync_interval)

                @codemirror.on 'change', (instance, changeObj) =>
                    #console.log("change event when live='#{@live().string()}'")
                    if changeObj.origin?
                        if changeObj.origin == 'undo'
                            @on_undo?(instance, changeObj)
                        if changeObj.origin == 'redo'
                            @on_redo?(instance, changeObj)
                        if changeObj.origin != 'setValue'
                            @_last_change_time = new Date()
                            @save_state_debounce()
                            @_syncstring.exit_undo_mode()
                    update_unsaved_uncommitted_changes()

                @emit('connect')   # successful connection
                cb?()  # done initializing document (this is used, e.g., in the SynchronizedWorksheet derived class).

        synchronized_string
            project_id    : @project_id
            filename      : misc.meta_file(@filename, 'chat')
            cb            : (err, chat_session) =>
                if not err  # err actually can't happen, since we retry until success...
                    @chat_session = chat_session
                    @init_chat()

    has_unsaved_changes: =>
        if not @codemirror?
            return false
        # This is potentially VERY expensive!!!
        return @_syncstring.hash_of_saved_version() != misc.hash_string(@codemirror.getValue())

    has_uncommitted_changes: =>
        # WARNING: potentially expensive to do @codemirror.getValue().
        return @_syncstring.has_uncommitted_changes() or @codemirror.getValue() != @_syncstring.get()

    _update_unsaved_uncommitted_changes: =>
        if not @codemirror?
            return
        if new Date() - (@_last_change_time ? 0) <= 1000
            # wait at least a second from when the user last changed the document, in case it's just a burst of typing.
            return
        x = @codemirror.getValue()
        @editor.has_unsaved_changes(@_syncstring.hash_of_saved_version() != misc.hash_string(x))
        uncommitted_changes = @_syncstring.has_uncommitted_changes() or x != @_syncstring.get()
        @editor.has_uncommitted_changes(uncommitted_changes)
        return uncommitted_changes

    _update_read_only: =>
        @editor.set_readonly_ui(@_syncstring.get_read_only())

    _sync: (cb) =>
        if @codemirror?  # need not be defined, right when user closes the editor instance
            @_syncstring.set(@codemirror.getValue())
        @_syncstring.save(cb)

    sync: (cb) =>
        @_sync(cb)

    # per-session sync-aware undo
    undo: () =>
        if not @codemirror?
            return
        if not @_syncstring.in_undo_mode()
            @_syncstring.set(@codemirror.getValue())
        value = @_syncstring.undo()
        @codemirror.setValueNoJump(value)
        @save_state_debounce()
        @_last_change_time = new Date()

    # per-session sync-aware redo
    redo: () =>
        if not @codemirror?
            return
        if not @_syncstring.in_undo_mode()
            return
        value = @_syncstring.redo()
        @codemirror.setValueNoJump(value)
        @save_state_debounce()
        @_last_change_time = new Date()

    _connect: (cb) =>
        # no op
        cb?()

    _save: (cb) =>
        if not @codemirror?
            cb() # nothing to do -- not initialized yet...
            return
        @_syncstring.set(@codemirror.getValue())
        async.series [@_syncstring.save, @_syncstring.save_to_disk], (err) =>
            @_update_unsaved_uncommitted_changes()
            if err
                cb(err)
            else
                @_post_save_success?()  # hook so that derived classes can do things, e.g., make blobs permanent
                cb()

    save: (cb) =>
        # This first call immediately sets saved button to disabled to make it feel like instant save.
        @editor.has_unsaved_changes(false)
        # We then simply ensure the save state is valid 5s later (in case save fails, say).
        setTimeout(@_update_unsaved_uncommitted_changes, 5000)

        cm = @focused_codemirror()
        if @editor.opts.delete_trailing_whitespace
            omit_lines = {}
            @_syncstring.get_cursors()?.map (x, _) =>
                x.get('locs')?.map (loc) =>
                    y = loc.get('y')
                    if y?
                        omit_lines[y] = true
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
                if cm.name != @focused_codemirror().name
                    # ignore non-focused editor
                    return
                if cm._setValueNoJump   # if true, this is being caused by external setValueNoJump
                    return
                # broadcast cursor positions
                locs = ({x:c.anchor.ch, y:c.anchor.line} for c in cm.listSelections())
                @_syncstring.set_cursor_locs(locs)
                # save primary cursor position to local storage for next time
                #console.log("setting cursor#{cm.name} to #{misc.to_json(cm.getCursor())}")
                @editor.local_storage("cursor#{cm.name}", cm.getCursor())

        @_syncstring.on 'cursor_activity', (account_id) =>
            @_render_other_cursor(account_id)

    get_users_cursors: (account_id) =>
        x = @_syncstring.get_cursors()?.get(account_id)
        #console.log("_render_other_cursor", x?.get('time'), misc.seconds_ago(@_other_cursor_timeout_s))
        # important: must use server time to compare, not local time.
        if salvus_client.server_time() - x?.get('time') <= @_other_cursor_timeout_s*1000
            locs = x.get('locs')?.toJS()
            return locs

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
                @draw_other_cursors(account_id, locs)

    # Move the cursor with given color to the given pos.
    draw_other_cursors: (account_id, locs) =>
        # ensure @_cursors is defined; this is map from key to ...?
        #console.log("draw_other_cursors(#{account_id}, #{misc.to_json(locs)})")
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
                data = x[i] = {cursor: templates.find(".smc-editor-codemirror-cursor").clone().show()}
            if name != data.name
                data.cursor.find(".smc-editor-codemirror-cursor-label").text(name)
                data.name = name
            if color != data.color
                data.cursor.find(".smc-editor-codemirror-cursor-inside").css('border-left': "1px solid #{color}")
                data.cursor.find(".smc-editor-codemirror-cursor-label" ).css(background: color)
                data.color = color

            # Place cursor in the editor in the right spot
            @codemirror.addWidget(pos, data.cursor[0], false)

            # Update cursor fade-out
            # LABEL: first fade the label out over 6s
            data.cursor.find(".smc-editor-codemirror-cursor-label").stop().animate(opacity:1).show().fadeOut(duration:6000)
            # CURSOR: then fade the cursor out (a non-active cursor is a waste of space) over 20s.
            data.cursor.find(".smc-editor-codemirror-cursor-inside").stop().animate(opacity:1).show().fadeOut(duration:20000)

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


exports.SynchronizedDocument2 = SynchronizedDocument2
