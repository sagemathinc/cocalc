###
Editor Actions
###

WIKI_HELP_URL = "https://github.com/sagemathinc/cocalc/wiki/editor"  # TODO -- write this

immutable  = require('immutable')
underscore = require('underscore')

{Actions}  = require('../smc-react')

misc = require('smc-util/misc')


keyboard = require('./keyboard')

class exports.Actions extends Actions
    _init: (project_id, path, syncstring, store) =>
        @project_id = project_id
        @path       = path
        @syncstring = syncstring
        @store      = store

        @_save_local_view_state = underscore.debounce((=>@__save_local_view_state?()), 1500)

        @_init_has_unsaved_changes()
        @setState
            local_view_state : @_load_local_view_state()

        @syncstring.once('init', @_syncstring_metadata)
        @syncstring.on('metadata-change', @_syncstring_metadata)

        @syncstring.on('change', @_syncstring_change)
        @syncstring.on('init', @_syncstring_change)

        @syncstring.once('load-time-estimate', (est) => @setState(load_time_estimate: est))

    close: =>
        if @_state == 'closed'
            return
        @_state = 'closed'
        @__save_local_view_state?()
        delete @_save_local_view_state
        @syncstring.close()
        delete @syncstring
        if @_key_handler?
            @redux.getActions('page').erase_active_key_handler(@_key_handler)
            delete @_key_handler

    __save_local_view_state: =>
        local_view_state = @store.get('local_view_state')
        if local_view_state? and localStorage?
            localStorage[@name] = JSON.stringify(local_view_state)

    _load_local_view_state: =>
        x = localStorage[@name]
        if x?
            local_view_state = immutable.fromJS(JSON.parse(x))
        local_view_state ?= immutable.Map()
        if not local_view_state.has("font_size")
            font_size = @redux.getStore('account')?.get('font_size') ? 14
            local_view_state = local_view_state.set('font_size', font_size)
        return local_view_state

    set_local_view_state: (obj, update_visible=true) =>
        if @_state == 'closed'
            return
        # Set local state related to what we see/search for/etc.
        local = @store.get('local_view_state')
        for key, value of obj
            local = local.set(key, immutable.fromJS(value))
        @setState
            local_view_state : local
        @_save_local_view_state()
        return

    enable_key_handler: =>
        if @_state == 'closed'
            return
        @_key_handler ?= keyboard.create_key_handler(@)
        @redux.getActions('page').set_active_key_handler(@_key_handler)

    disable_key_handler: =>
        @redux.getActions('page').erase_active_key_handler(@_key_handler)

    _init_has_unsaved_changes: =>  # basically copies from tasks/actions.coffee -- opportunity to refactor
        do_set = =>
            @setState
                has_unsaved_changes     : @syncstring?.has_unsaved_changes()
                has_uncommitted_changes : @syncstring?.has_uncommitted_changes()
        f = =>
            do_set()
            setTimeout(do_set, 3000)
        @set_save_status = underscore.debounce(f, 500, true)
        @syncstring.on('metadata-change', @set_save_status)
        @syncstring.on('connected',       @set_save_status)

    _syncstring_metadata: =>
        read_only = @syncstring.get_read_only()
        if read_only != @store.get('read_only')
            @setState(read_only: read_only)

    _syncstring_change: (changes) =>
        if not @store.get('is_loaded')
            @setState(is_loaded: true)
        @set_save_status?()

    save: =>
        @setState(has_unsaved_changes:false)
        @syncstring.save_to_disk =>
            @set_save_status()

    time_travel: =>
        @redux.getProjectActions(@project_id).open_file
            path       : misc.history_path(@path)
            foreground : true

    help: =>
        window.open(WIKI_HELP_URL, "_blank").focus()

    undo: =>
        # TODO: do we need explicit exit of undo mode anywhere??!
        @syncstring?.undo()

    redo: =>
        @syncstring?.redo()

    set_font_size: (size) =>
        @set_local_view_state(font_size: size)

    increase_font_size: =>
        size = @store.getIn(['local_view_state', 'font_size'])
        @set_local_view_state(font_size: size+1)

    decrease_font_size: =>
        size = @store.getIn(['local_view_state', 'font_size'])
        @set_local_view_state(font_size: size-1)

    set_cm: (cm) =>
        @cm = cm
        @set_codemirror_to_syncstring()

    focused_codemirror: =>
        return @cm

    syncstring_save: =>
        @syncstring?.save()
        @set_save_status()

    set_syncstring_to_codemirror: =>
        if not @cm? or not @syncstring?
            return
        @syncstring.from_str(@cm.getValue())

    set_codemirror_to_syncstring: =>
        if not @cm? or not @syncstring?
            return
        @cm.setValueNoJump(@syncstring.to_str())
        @set_save_status()

    exit_undo_mode: =>
        @syncstring.exit_undo_mode()

    # per-session sync-aware undo
    undo: =>
        if not @cm?
            return
        cm = @focused_codemirror()
        if not @syncstring.in_undo_mode()
            @set_syncstring_to_codemirror()
        value = @syncstring.undo().to_str()
        cm.setValueNoJump(value)
        @set_syncstring_to_codemirror()
        @syncstring_save()

    # per-session sync-aware redo
    redo: =>
        if not @cm?
            return
        if not @syncstring.in_undo_mode()
            return
        doc = @syncstring.redo()
        if not doc?
            # can't redo if version not defined/not available.
            return
        value = doc.to_str()
        @focused_codemirror().setValueNoJump(value)
        @set_syncstring_to_codemirror()
        @syncstring_save()

    find: =>
        console.log 'find, todo'

    replace: =>
        console.log 'replace, todo'

    goto_line: =>
        console.log 'goto_line, todo'

    split_view: =>
        console.log 'split_view, todo'

    copy: =>
        console.log 'copy, todo'

    paste: =>
        console.log 'paste, todo'

    print: =>
        console.log 'print, todo'
