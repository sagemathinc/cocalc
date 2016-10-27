###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, 2015, 2016 William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Gener@al Public License as published by
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

$        = window.$
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

side_chat = require('./side_chat')

{IS_MOBILE} = require('./feature')

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

        # # send chat message
        # input.keydown (evt) =>
        #     if evt.which == 13 # enter
        #         content = $.trim(input.val())
        #         if content != ""
        #             input.val("")
        #             @write_chat_message
        #                 event_type : "chat"
        #                 payload    : {content : content}
        #         return false

        #@chat_session.on('sync', (=>@render_chat_log()))

        #@render_chat_log()  # first time
        @init_chat_toggle()
        @init_video_toggle()


    # This is an interface that allows messages to be passed between connected
    # clients via a log in the filesystem. These messages are handled on all
    # clients through the render_chat_log() method, which listens to the 'sync'
    # event emitted by the chat_session object.

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
        #@element.find(".salvus-editor-codemirror-input-box").removeClass('col-sm-12').addClass('col-sm-9')
        @element.find(".salvus-editor-codemirror-chat-column").show()
        # see http://stackoverflow.com/questions/4819518/jquery-ui-resizable-does-not-support-position-fixed-any-recommendations
        # if you want to try to make this resizable
        @editor.show()  # updates editor width
        @editor.emit 'show-chat'

        # The height of the chat log should be the difference between the window height and the nav bar, file tabs, button row, and chat input box.
        chat_height = $(document).height() - $(".navbar").height() - $(".smc-file-tabs").height() - @element.find(".salvus-editor-codemirror-button-row").height() - 63

        @_chat_redux_name = side_chat.render(@editor.project_id, @editor.chat_filename, @editor.chat_elt[0], redux, chat_height)

        height_resize = () =>
            chat_height = $(document).height() - $(".navbar").height() - $(".smc-file-tabs").height() - @element.find(".salvus-editor-codemirror-button-row").height() - 63
            @_chat_redux_name = side_chat.render(@editor.project_id, @editor.chat_filename, @editor.chat_elt[0], redux, chat_height)
        $(window).resize(height_resize)

    hide_chat_window: () =>
        # HIDE the chat window
        @editor._chat_is_hidden = true
        @editor.local_storage("chat_is_hidden", true)
        @element.find(".salvus-editor-chat-hide").hide()
        @element.find(".salvus-editor-chat-show").show()
        #@element.find(".salvus-editor-codemirror-input-box").removeClass('col-sm-9').addClass('col-sm-12')
        @element.find(".salvus-editor-codemirror-chat-column").hide()
        @editor.show()  # update size/display of editor (especially the width)
        @editor.emit('hide-chat')

    init_video_toggle: () =>
        video_on_button  = @element.find(".salvus-editor-chat-video-is-off")
        video_off_button = @element.find(".salvus-editor-chat-video-is-on")

        video_on_button.click () =>
            actions = redux.getActions(@_chat_redux_name)
            actions.open_video_chat_window()
            @element.find(".salvus-editor-chat-video-is-off").hide()
            @element.find(".salvus-editor-chat-video-is-on").show()
            actions._video_window.addEventListener "unload", () =>
                @element.find(".salvus-editor-chat-video-is-off").show()
                @element.find(".salvus-editor-chat-video-is-on").hide()

        video_off_button.click () =>
            actions = redux.getActions(@_chat_redux_name)
            actions.close_video_chat_window()
            @element.find(".salvus-editor-chat-video-is-off").show()
            @element.find(".salvus-editor-chat-video-is-on").hide()

    search_message_log: =>
        messages = @chat_session.live()
        messages = messages.split('\n')
        all_messages = []
        for m in messages
            if $.trim(m) == ""
                continue
            try
                new_message = JSON.parse(m)
            catch e
                continue # skip

            all_messages.push(new_message)
        return all_messages

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

        @_syncstring.on 'deleted', =>
            redux.getProjectActions(@project_id).close_tab(@filename)

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

                @_syncstring.on 'deleted', =>
                    redux.getProjectActions(@editor.project_id).close_tab(@filename)

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
        @codemirror.setValueNoJump(value, true)
        @save_state_debounce()
        @_last_change_time = new Date()

    # per-session sync-aware redo
    redo: () =>
        if not @codemirror?
            return
        if not @_syncstring.in_undo_mode()
            return
        value = @_syncstring.redo()
        @codemirror.setValueNoJump(value, true)
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
