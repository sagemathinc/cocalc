#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

{SAVE_DEBOUNCE_MS} = require("@cocalc/frontend/frame-editors/code-editor/const")

$        = window.$
misc     = require('@cocalc/util/misc')
{defaults, required} = misc

message  = require('@cocalc/util/message')
markdown = require('./markdown')

{webapp_client} = require('./webapp-client')
{alert_message} = require('./alerts')

async = require('async')

templates = $("#webapp-editor-templates")

account = require('./account')

{redux} = require('./app-framework')

{EventEmitter} = require('events')

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
        if @_closed
            return []
        v = [@codemirror]
        if @editor._layout > 0
            v.push(@codemirror1)
        return v

    focused_codemirror: () =>
        @editor.focused_codemirror()

underscore = require('underscore')

class SynchronizedString extends AbstractSynchronizedDoc
    constructor: (opts) ->
        super()
        @opts = defaults opts,
            project_id        : required
            filename          : required
            sync_interval     : 1000       # TODO: ignored right now -- no matter what, we won't send sync messages back to the server more frequently than this (in ms)
            cursors           : false
            cb                : required   # cb(err) once doc has connected to hub first time and got session info; will in fact keep trying
        # window.w = @
        @project_id  = @opts.project_id
        @filename    = @opts.filename
        @connect     = @_connect
        @_syncstring = webapp_client.sync_client.sync_string
            project_id    : @project_id
            path          : @filename
            cursors       : opts.cursors

        @_syncstring.once 'ready', =>
            @emit('connect')   # successful connection
            # first time open a file, have to look on disk to
            # load it -- this ensures that is done
            try
                await @_syncstring.wait_until_read_only_known()
            catch err
                opts.cb(err)
                return
            @_fully_loaded = true
            opts.cb(undefined, @)

        @_syncstring.on 'change', => # only when change is external
            @emit('sync')

        @_syncstring.on 'before-change', =>
            @emit('before-change')

        @_syncstring.on 'deleted', =>
            redux.getProjectActions(@project_id).close_tab(@filename)

    live: (s) =>
        cur = @_syncstring.to_str()
        if s? and s != cur
            @_syncstring.exit_undo_mode()
            @_syncstring.from_str(s)
            @emit('sync')
        else
            return cur

    sync: (cb) =>
        @_syncstring.commit()
        await @_syncstring.save()
        cb?()

    _connect: (cb) =>
        # no op
        cb?()

    _save: (cb) =>
        if not @_fully_loaded or not @_syncstring?
            cb?()
            return
        try
            @_syncstring.commit()
            await @_syncstring.save()
            await @_syncstring.save_to_disk()
            cb?()
        catch err
            cb?(err)

    save: (cb) =>
        misc.retry_until_success
            f           : @_save
            start_delay : 3000
            max_tries   : 4
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
        @_syncstring.set_doc(@_syncstring.undo())
        @emit('sync')

    # per-session sync-aware redo
    redo: () =>
        @_syncstring.set_doc(@_syncstring.redo())
        @emit('sync')

    in_undo_mode: () =>
        return @_syncstring.in_undo_mode()

    exit_undo_mode: () =>
        return @_syncstring.exit_undo_mode()

class SynchronizedDocument2 extends SynchronizedDocument
    constructor: (editor, opts) ->
        super()
        @editor = editor
        @opts = defaults opts,
            cursor_interval : 1000   # ignored below right now
            sync_interval   : 2000   # never send sync messages upstream more often than this
            cm_foldOptions  : undefined
            static_viewer   : undefined # must be considered now due to es6 classes
            allow_javascript_eval : true   # used only by sage worksheets, which derive from this -- but we have to put this here due to super being called.
            persistent : false

        if @opts.static_viewer?
            return

        @project_id  = @editor.project_id
        @filename    = @editor.filename
        @connect     = @_connect
        @editor.save = @save
        @codemirror  = @editor.codemirror
        @codemirror1 = @editor.codemirror1
        @element     = @editor.element

        if @opts.cm_foldOptions?
            for cm in @codemirrors()
                cm.setOption('foldOptions', @opts.foldOptions)

        # replace undo/redo by sync-aware versions
        for cm in [@codemirror, @codemirror1]
            cm.undo = @undo
            cm.redo = @redo

        @_users = redux.getStore('users')  # TODO -- obviously not like this...

        @_other_cursor_timeout_s = 30  # only show active other cursors for this long

        @editor.show_startup_message("Loading...", 'info')
        @codemirror.setOption('readOnly', true)
        @codemirror1.setOption('readOnly', true)
        @codemirror.setValue('Loading...')

        if @filename[0] == '/'
            # uses symlink to '/', which is created by start_smc
            @filename = '.smc/root' + @filename

        id = require('@cocalc/util/schema').client_db.sha1(@project_id, @filename)
        @_syncstring = webapp_client.sync_client.sync_string
            id         : id
            project_id : @project_id
            path       : @filename
            cursors    : true
            persistent : @opts.persistent

        @_syncstring.on 'before-change', @_set_syncstring_to_codemirror

        @_syncstring.on 'after-change', @_set_codemirror_to_syncstring

        @_syncstring.once 'load-time-estimate', (est) ->
            # TODO: do something with this.
            #console.log 'load time estimate', est

        # This is important to debounce since above hash/getValue
        # grows linearly in size of document; also, we debounce
        # instead of throttle, since we don't want to have this
        # slow down the user while they are typing.
        f = () =>
            if @_update_unsaved_uncommitted_changes()
                # Check again in 5s no matter what if there are
                # uncommitted changes, since otherwise
                # there could be a stuck notification saying
                # there are uncommitted changes.
                setTimeout(f, 5000)
        update_unsaved_uncommitted_changes = underscore.debounce(f, 1500)
        @editor.has_unsaved_changes(false) # start by assuming no unsaved changes...
        #dbg = webapp_client.dbg("SynchronizedDocument2(path='#{@filename}')")
        #dbg("waiting for first change")

        @_syncstring.once "error", (err) =>
            if @_closed
                return
            if err.code == 'EACCES'
                err = "You do not have permission to read '#{@filename}'."
            @editor.show_startup_message(err, 'danger')
            return

        @_syncstring.once 'ready', =>
            if @_closed
                return
            # Now wait until read_only is *defined*, so backend file has been opened.
            await @_syncstring.wait_until_read_only_known()
            if @_closed
                return
            @editor.show_content()
            @editor._set(@_syncstring.to_str())
            @_fully_loaded = true
            @codemirror.setOption('readOnly', false)
            @codemirror1.setOption('readOnly', false)
            @codemirror.clearHistory()  # ensure that the undo history doesn't start with "empty document"
            @codemirror1.clearHistory()

            update_unsaved_uncommitted_changes()
            @_update_read_only()

            @_init_cursor_activity()

            redux.getProjectActions(@project_id)?.log_opened_time(@filename)

            @_syncstring.on 'change', =>
                if @_closed
                    return
                #dbg("got upstream syncstring change: '#{misc.trunc_middle(@_syncstring.to_str(),400)}'")
                #@_set_codemirror_to_syncstring()
                @emit('sync')

            @_syncstring.on 'metadata-change', =>
                if @_closed
                    return
                update_unsaved_uncommitted_changes()
                @_update_read_only()

            @_syncstring.on 'deleted', =>
                if @_closed
                    return
                redux.getProjectActions(@editor.project_id).close_tab(@filename)

            @save_state_debounce = underscore.debounce(@sync, SAVE_DEBOUNCE_MS)

            @codemirror.on 'change', (instance, changeObj) =>
                if @_closed
                    return
                if not @_setting_from_syncstring
                    # console.log 'user_action = true'
                    @_user_action = true
                # console.log("change event - origin=", changeObj.origin)
                if changeObj.origin?
                    if changeObj.origin == 'undo'
                        @on_undo?(instance, changeObj)
                    if changeObj.origin == 'redo'
                        @on_redo?(instance, changeObj)
                    if changeObj.origin != 'setValue'
                        @_last_change_time = new Date()
                        @save_state_debounce?()
                update_unsaved_uncommitted_changes()

            @emit('connect')   # successful connection
            @_init_cb?()  # done initializing document (this is used, e.g., in the SynchronizedWorksheet derived class).

    _debug_sync_state: (info) =>
        console.log "--- #{info}"
        console.log "codemirror='#{@codemirror?.getValue()}'"
        console.log "syncstring='#{@_syncstring?.to_str()}'"
        if info == 'after' and @codemirror?.getValue() != @_syncstring?.to_str()
            console.warn("BUG -- values are different!")

    # Set value of the syncstring to equal current value of the codemirror editor
    _set_syncstring_to_codemirror: =>
        if not @codemirror?
            return
        #console.log '_set_syncstring_to_codemirror'
        #@_debug_sync_state('before')
        if not @_user_action
            # console.log "not setting due to no user action"
            # user has not explicitly done anything, so there should be no changes.
            return
        #console.log 'user action so setting'
        @_user_action = false
        @_last_val = val = @codemirror.getValue()
        if val != @_syncstring.to_str()
            @_syncstring.exit_undo_mode()
            @_syncstring.from_str(val)
        #@_debug_sync_state('after')

    # Set value of the codemirror editor to equal current value of the syncstring
    _set_codemirror_to_syncstring: =>
        if not @codemirror?
            return
        #console.log '_set_codemirror_to_syncstring'
        #@_debug_sync_state('before')
        @_setting_from_syncstring = true
        @_last_set = val = @_syncstring.to_str()
        @codemirror.setValueNoJump(val)
        @_setting_from_syncstring = false
        #@_debug_sync_state('after')

    has_unsaved_changes: =>
        if not @codemirror?
            return false
        # This is potentially VERY expensive!!!
        return @_syncstring.hash_of_saved_version() != misc.hash_string(@codemirror.getValue())

    has_uncommitted_changes: =>
        # WARNING: potentially expensive to do @codemirror.getValue().
        return @_syncstring.has_uncommitted_changes() or @codemirror.getValue() != @_syncstring.to_str()

    _update_unsaved_uncommitted_changes: =>
        if not @_fully_loaded or not @codemirror? or @_closed
            return
        if new Date() - (@_last_change_time ? 0) <= 1000
            # wait at least a second from when the user last changed the document, in case it's just a burst of typing.
            return
        x = @codemirror.getValue()
        @editor.has_unsaved_changes(@_syncstring.hash_of_saved_version() != misc.hash_string(x))
        uncommitted_changes = @_syncstring.has_uncommitted_changes() or x != @_syncstring.to_str()
        @editor.has_uncommitted_changes(uncommitted_changes)
        return uncommitted_changes

    _update_read_only: =>
        @editor.set_readonly_ui(@_syncstring.is_read_only())

    sync: (cb) =>
        if not @codemirror? or @_syncstring?.get_state() != 'ready'
            # codemirror need not be defined or @_syncstring might be not ready to use, e.g.,
            # right when user closes the editor instance
            cb?()
            return
        @_set_syncstring_to_codemirror()
        @_syncstring.commit()
        try
            await @_syncstring.save()
            cb?()
        catch err
            cb?(err)


    # per-session sync-aware undo
    undo: () =>
        if not @codemirror?
            return
        cm = @focused_codemirror()  # see https://github.com/sagemathinc/cocalc/issues/1161
        if not @_syncstring.in_undo_mode()
            @_set_syncstring_to_codemirror()
        value = @_syncstring.undo().to_str()
        cm.setValueNoJump(value, true)
        @save_state_debounce?()
        @_last_change_time = new Date()

    # per-session sync-aware redo
    redo: () =>
        if not @codemirror?
            return
        if not @_syncstring.in_undo_mode()
            return
        doc = @_syncstring.redo()
        if not doc?
            # can't redo if version not defined/not available.
            return
        if not doc.to_str?
            # BUG -- see https://github.com/sagemathinc/cocalc/issues/1831
            throw Error("doc must have a to_str method, but is doc='#{doc}', typeof(doc)='#{typeof(doc)}'")
        value = doc.to_str()
        @focused_codemirror().setValueNoJump(value, true)
        @save_state_debounce?()
        @_last_change_time = new Date()

    _connect: (cb) =>
        # no op
        cb?()

    _save: (cb) =>
        if not @codemirror? or not @_fully_loaded
            cb() # nothing to do -- not initialized/loaded yet...
            return
        @_set_syncstring_to_codemirror()
        # Do save_to_disk immediately, then -- if any unsaved
        # to backend changes, save those.  Finally, save to disk again.
        # We do this so we succeed at saving to disk, in case
        # file is being **immediately** closed right when saving to disk,
        # which happens on tab close.
        try
            await @_syncstring.save_to_disk()
            @_syncstring.commit()
            await @_syncstring.save()
            await @_syncstring.save_to_disk()
        catch err
            cb(err)
            return
        @_update_unsaved_uncommitted_changes()
        @_post_save_success?()
        # hook so that derived classes can do things, e.g., make blobs permanent
        cb()

    delete_trailing_whitespace: =>
        cm = @focused_codemirror()
        omit_lines = {}
        @_syncstring.get_cursors()?.map (x, _) =>
            x.get('locs')?.map (loc) =>
                y = loc.get('y')
                if y?
                    omit_lines[y] = true
        cm.delete_trailing_whitespace(omit_lines:omit_lines)

    save: (cb) =>
        if @_closed
            cb?()
            return
        # This first call immediately sets saved button to disabled to make it feel like instant save.
        @editor.has_unsaved_changes(false)
        # We then simply ensure the save state is valid 5s later (in case save fails, say).
        setTimeout(@_update_unsaved_uncommitted_changes, 5000)

        misc.retry_until_success
            f           : @_save
            start_delay : 3000
            max_tries   : 4
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
        if not @_syncstring?
            return
        x = @_syncstring.get_cursors()?.get(account_id)
        #console.log("_render_other_cursor", x?.get('time'), misc.seconds_ago(@_other_cursor_timeout_s))
        # important: must use server time to compare, not local time.
        if webapp_client.server_time() - x?.get('time') <= @_other_cursor_timeout_s*1000
            locs = x.get('locs')?.toJS()
            return locs

    _render_other_cursor: (account_id) =>
        #if account_id == webapp_client.account_id
            # nothing to do -- we don't draw our own cursor via this
        #    return
        x = @_syncstring.get_cursors()?.get(account_id)
        #console.log("_render_other_cursor", x?.get('time'), misc.seconds_ago(@_other_cursor_timeout_s))
        # important: must use server time to compare, not local time.
        if webapp_client.server_time() - x?.get('time') <= @_other_cursor_timeout_s*1000
            locs = x.get('locs')?.toJS()
            if locs?
                #console.log("draw cursors for #{account_id} at #{misc.to_json(locs)} expiring after #{@_other_cursor_timeout_s}s")
                @draw_other_cursors(account_id, locs)

    # Move the cursor with given color to the given pos.
    draw_other_cursors: (account_id, locs) =>
        if not @codemirror? # can happen right when closing.
            return
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
            color = @_users.get_color_sync(account_id)
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
            # LABEL: first fade the label out over 15s
            data.cursor.find(".smc-editor-codemirror-cursor-label").stop().animate(opacity:1).show().fadeOut(duration:15000)
            # CURSOR: then fade the cursor out (a non-active cursor is a waste of space) over 25s.
            data.cursor.find(".smc-editor-codemirror-cursor-inside").stop().animate(opacity:1).show().fadeOut(duration:25000)

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
        # TODO -- this doesn't work...
        for cm in [@codemirror, @codemirror1]
            continue if not cm?
            cm.setOption("mode", "text/x-csrc")
            cmElem = cm.getWrapperElement()
            cmElem.parentNode.removeChild(cmElem)
        delete @codemirror
        delete @codemirror1
        delete @editor.codemirror
        delete @editor.codemirror1
        @_closed = true


exports.SynchronizedDocument2 = SynchronizedDocument2
