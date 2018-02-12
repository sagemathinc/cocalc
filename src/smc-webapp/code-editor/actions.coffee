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

        @_init_has_unsaved_changes()
        @syncstring.once('init', @_syncstring_metadata)
        @syncstring.on('metadata-change', @_syncstring_metadata)

        @syncstring.on('change', @_syncstring_change)
        @syncstring.on('init', @_syncstring_change)

        @syncstring.once('load-time-estimate', (est) => @setState(load_time_estimate: est))

    close: =>
        if @_state == 'closed'
            return
        @_state = 'closed'
        @syncstring.close()
        delete @syncstring
        if @_key_handler?
            @redux.getActions('page').erase_active_key_handler(@_key_handler)
            delete @_key_handler

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
        @set_save_status = underscore.debounce(f, 500)
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

    syncstring_save: =>
        @syncstring?.save()

    set_syncstring_to_codemirror: =>
        if not @cm? or not @syncstring?
            return
        @syncstring.from_str(@cm.getValue())

    set_codemirror_to_syncstring: =>
        if not @cm? or not @syncstring?
            return
        @cm.setValueNoJump(@syncstring.to_str())

    exit_undo_mode: =>
        @syncstring.exit_undo_mode()