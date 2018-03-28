###
Code Editor Actions
###

WIKI_HELP_URL   = "https://github.com/sagemathinc/cocalc/wiki/editor"  # TODO -- write this

immutable       = require('immutable')
underscore      = require('underscore')

schema          = require('smc-util/schema')

{webapp_client} = require('../webapp_client')
{Actions}       = require('../smc-react')
misc            = require('smc-util/misc')
keyboard        = require('./keyboard')
copypaste       = require('../copy-paste-buffer')
tree_ops        = require('./tree-ops')
print           = require('./print')
spell_check     = require('./spell-check')

class exports.Actions extends Actions
    _init: (project_id, path, is_public, store) =>
        @project_id = project_id
        @path       = path
        @store      = store
        @is_public  = is_public

        if is_public
            @_init_content()
        else
            @_init_syncstring()

        @setState
            is_public           : is_public
            local_view_state    : @_load_local_view_state()

        @_save_local_view_state = underscore.debounce((=>@__save_local_view_state?()), 1500)

    # Init setting of content exactly once based on
    # reading file from disk via public api, or setting
    # from syncstring as a responde to explicit user action.
    _init_content: =>
        if not @is_public
            # Get via the syncstring.
            content = @_syncstring.to_str()
            if content != @store.get('content')
                @setState(content: content)
            return
        # Get by loading from backend as a public file
        @setState(is_loaded : false)
        webapp_client.public_get_text_file
            project_id         : @project_id
            path               : @path
            cb                 : (err, data) =>
                if err
                    @set_error("Error loading -- #{err}")
                else
                    @setState(content: data)
                @setState(is_loaded: true)

    # Init setting of value whenever syncstring changes -- only used in derived classes
    _init_syncstring_value: =>
        @_syncstring.on 'change', =>
            @setState(value: @_syncstring?.to_str())

    # Init spellchecking whenever syncstring saves -- only used in derived classes, where
    # spelling makes sense...
    _init_spellcheck: =>
        @update_misspelled_words()
        @_syncstring.on 'save-to-disk', =>
            @update_misspelled_words()

    reload: =>
        if not @store.get('is_loaded')
            # already loading
            return
        # this sets is_loaded to false... loads, then sets to true.
        @_init_content()

    _init_syncstring: =>
        @_syncstring = webapp_client.sync_string
            id                 : schema.client_db.sha1(@project_id, @path)
            project_id         : @project_id
            path               : @path
            cursors            : true
            before_change_hook : @set_syncstring_to_codemirror
            after_change_hook  : @set_codemirror_to_syncstring

        @_syncstring.once 'init', (err) =>
            if err
                @set_error("Error opening -- #{err}")

        @_syncstring.once('init', @_syncstring_metadata)
        @_syncstring.on('metadata-change', @_syncstring_metadata)
        @_syncstring.on('cursor_activity', @_syncstring_cursor_activity)

        @_syncstring.on('change', @_syncstring_change)
        @_syncstring.on('init', @_syncstring_change)

        @_syncstring.once('load-time-estimate', (est) => @setState(load_time_estimate: est))

        @_syncstring.on 'save-to-disk', =>
            # incremenet save_to_disk counter, so that react components can react to save_to_disk event happening.
            @set_reload('save_to_disk')

        @_init_has_unsaved_changes()

    set_reload: (type) =>
        reload = @store.get('reload') ? immutable.Map()
        @setState(reload: reload.set(type, (reload.get(type) ? 0) + 1))

    set_resize: =>
        @setState(resize: (@store.get('resize') ? 0) + 1)

    close: =>
        if @_state == 'closed'
            return
        @_state = 'closed'
        @__save_local_view_state?()
        delete @_save_local_view_state
        if @_key_handler?
            @redux.getActions('page').erase_active_key_handler(@_key_handler)
            delete @_key_handler
        if @_syncstring?
            # Do not want to loose the very last change user made!
            @set_syncstring_to_codemirror()
            @_syncstring._save()
            @_syncstring.close()
            delete @_syncstring

    __save_local_view_state: =>
        local_view_state = @store.get('local_view_state')
        if local_view_state? and localStorage?
            localStorage[@name] = JSON.stringify(local_view_state)

    _load_local_view_state: =>
        x = localStorage[@name]
        if x?
            local_view_state = immutable.fromJS(JSON.parse(x))
        local_view_state ?= immutable.Map()

        if not local_view_state.has('version') # may use to deprecate in case we change format.
            local_view_state = local_view_state.set('version', 1)

        if not local_view_state.has('editor_state')
            local_view_state = local_view_state.set('editor_state', immutable.Map())

        if not local_view_state.has("font_size")
            font_size = @redux.getStore('account')?.get('font_size') ? 14
            local_view_state = local_view_state.set('font_size', font_size)

        frame_tree = local_view_state.get('frame_tree')
        if not frame_tree?
            frame_tree = @_default_frame_tree()
        else
            frame_tree = tree_ops.assign_ids(frame_tree)
            frame_tree = tree_ops.ensure_ids_are_unique(frame_tree)
        local_view_state = local_view_state.set('frame_tree', frame_tree)

        active_id = local_view_state.get('active_id')
        if not active_id? or not tree_ops.is_leaf_id(frame_tree, active_id)
            local_view_state = local_view_state.set('active_id', tree_ops.get_some_leaf_id(frame_tree))

        return local_view_state

    reset_local_view_state: =>
        delete localStorage[@name]
        @setState(local_view_state : @_load_local_view_state())

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

    set_active_id: (active_id, block_ms) =>
        if @_ignore_set_active_id
            return
        if block_ms
            @_ignore_set_active_id = true
            setTimeout((=>@_ignore_set_active_id=false), block_ms)
        local = @store.get('local_view_state')
        if local?.get('active_id') == active_id
            # already set -- nothing more to do
            return
        if tree_ops.is_leaf_id(local?.get('frame_tree'), active_id)
            @setState(local_view_state : @store.get('local_view_state').set('active_id', active_id))
            @_save_local_view_state()
            @focus()
        return

    _get_tree: =>
        @store.getIn(['local_view_state', 'frame_tree'])

    _get_leaf_ids: =>
        tree_ops.get_leaf_ids(@_get_tree())

    _tree_op: (op, args...) =>
        local = @store.get('local_view_state')
        if not local?
            return
        t0    = local?.get('frame_tree')
        if not t0?
            return
        f = tree_ops[op]
        if not f?
            throw Error("unknown tree op '#{op}'")
        t1 = f(t0, args...)
        if t1 != t0
            if op == 'delete_node'
                if not tree_ops.is_leaf_id(t1, local.get('active_id'))
                    local = local.set('active_id',  tree_ops.get_some_leaf_id(t1))
                if not tree_ops.is_leaf_id(t1, local.get('full_id'))
                    local = local.delete('full_id')
            @setState(local_view_state : local.set('frame_tree', t1))
            @_save_local_view_state()
        return

    _default_frame_tree: =>
        frame_tree = immutable.fromJS(@_raw_default_frame_tree())
        frame_tree = tree_ops.assign_ids(frame_tree)
        frame_tree = tree_ops.ensure_ids_are_unique(frame_tree)
        return frame_tree

    # define this in derived classes.
    _raw_default_frame_tree: =>
        return {type : 'cm'}

    set_frame_tree: (obj) =>
        @_tree_op('set', obj)

    reset_frame_tree: =>
        local = @store.get('local_view_state')
        local = local.set('frame_tree', @_default_frame_tree())
        @setState(local_view_state: local)
        @_save_local_view_state()
        return

    set_frame_tree_leafs: (obj) =>
        @_tree_op('set_leafs', obj)

    # This is only used in derived classes right now
    set_frame_type: (id, type) =>
        @set_frame_tree(id:id, type:type)

    _get_frame_node: (id) =>
        return tree_ops.get_node(@_get_tree(), id)

    close_frame: (id) =>
        if tree_ops.is_leaf(@_get_tree())
            # closing the only node, so reset to default
            @reset_local_view_state()
            return
        @_tree_op('delete_node', id)
        @save_editor_state(id)
        delete @_cm_selections?[id]
        delete @_cm?[id]
        setTimeout(@focus, 1)

    split_frame: (direction, id) =>
        ids0 = @_get_leaf_ids()
        @_tree_op('split_leaf', id ? @store.getIn(['local_view_state', 'active_id']), direction)
        for i,_ of @_get_leaf_ids()
            if not ids0[i]
                @copy_editor_state(id, i)
                id = i  # this is a new id
                break
        # The block_ms=1 here is since the set can cause a bunch of rendering to happen
        # which causes some other cm to focus, which changes the id.  Instead of a flicker
        # and changing it back, we just prevent any id change for 1ms, which covers
        # the render cycle.
        @set_active_id(id, 1)

    set_frame_full: (id) =>
        local = @store.get('local_view_state').set('full_id', id)
        if id?
            local = local.set('active_id', id)
        @setState(local_view_state : local)
        @_save_local_view_state()
        setTimeout(@focus, 1)

    save_editor_state: (id, new_editor_state) =>
        if @_state == 'closed'
            return
        local  = @store.get('local_view_state')
        if not local?
            return
        editor_state = local.get('editor_state') ? immutable.Map()
        if not new_editor_state?
            if not editor_state.has(id)
                return
            editor_state = editor_state.delete(id)
        else
            editor_state = editor_state.set(id, immutable.fromJS(new_editor_state))
        @setState(local_view_state : local.set('editor_state', editor_state))
        @_save_local_view_state()

    copy_editor_state: (id1, id2) =>
        info = @store.getIn(['local_view_state', 'editor_state', id1])
        if info?
            @save_editor_state(id2, info)

    enable_key_handler: =>
        if @_state == 'closed'
            return
        @_key_handler ?= keyboard.create_key_handler(@)
        @redux.getActions('page').set_active_key_handler(@_key_handler)

    disable_key_handler: =>
        @redux.getActions('page').erase_active_key_handler(@_key_handler)

    # Set has_unsaved_changes to the given value; also, if
    # time is given, do not allow @set_save_status to change it
    # for that many ms.
    set_has_unsaved_changes: (value, time) =>
        if @_lock_unsaved_changes
            return
        @setState(has_unsaved_changes: !!value)
        if time?
            @_lock_unsaved_changes = true
            f = =>
                @_lock_unsaved_changes = false
                @set_save_status()
            setTimeout(f, time)

    _init_has_unsaved_changes: =>  # basically copies from tasks/actions.coffee -- opportunity to refactor
        do_set = =>
            if @_lock_unsaved_changes
                return
            @setState
                has_unsaved_changes     : @_syncstring?.has_unsaved_changes()
                has_uncommitted_changes : @_syncstring?.has_uncommitted_changes()
        f = =>
            do_set()
            setTimeout(do_set, 3000)
        @set_save_status = underscore.debounce(f, 500, true)
        @_syncstring.on('metadata-change', @set_save_status)
        @_syncstring.on('connected',       @set_save_status)

    _syncstring_metadata: =>
        if not @_syncstring?
            return
        read_only = @_syncstring.get_read_only()
        if read_only != @store.get('read_only')
            @setState(read_only: read_only)

    _syncstring_cursor_activity: =>
        # TODO: for now, just for the one syncstring obviously
        # TOOD: this is probably naive and slow too...
        cursors = immutable.Map()
        @_syncstring.get_cursors().forEach (info, account_id) =>
            if account_id == @_syncstring._client.account_id  # skip self.
                return
            info.get('locs').forEach (loc) =>
                loc  = loc.set('time', info.get('time'))
                locs = (cursors.get(account_id) ? immutable.List()).push(loc)
                cursors = cursors.set(account_id, locs)
                return
            return
        if not cursors.equals(@store.get('cursors'))
            @setState(cursors: cursors)

    _syncstring_change: (changes) =>
        if not @store.get('is_loaded')
            @setState(is_loaded: true)
        @set_save_status?()

    set_cursor_locs:  (locs=[], side_effect) =>
        if locs.length == 0
            # don't remove on blur -- cursor will fade out just fine
            return
        @_syncstring?.set_cursor_locs(locs, side_effect)

    delete_trailing_whitespace: =>
        cm = @_get_cm()
        if not cm?
            return
        omit_lines = {}
        @_syncstring.get_cursors()?.map (x, _) =>
            x.get('locs')?.map (loc) =>
                y = loc.get('y')
                if y?
                    omit_lines[y] = true
        cm.delete_trailing_whitespace(omit_lines:omit_lines)

    _do_save: (cb) =>
        @_syncstring?.save_to_disk (err) =>
            @set_save_status()
            cb?(err)

    save: (explicit) =>
        if @is_public
            return
        @set_has_unsaved_changes(false, 3000)
        # TODO: what about markdown, where do not want this...
        # and what about multiple syncstrings...
        # TODO: Maybe just move this to some explicit menu of actions, which also includes
        # several other formatting actions.
        # Doing this automatically is fraught with error, since cursors aren't precise...
        if explicit and @redux.getStore('account')?.getIn(['editor_settings', 'strip_trailing_whitespace'])
            @delete_trailing_whitespace()
        @_do_save =>
            # do it again...
            setTimeout(@_do_save, 500)
        if explicit
            @_active_cm()?.focus()

    time_travel: =>
        @redux.getProjectActions(@project_id).open_file
            path       : misc.history_path(@path)
            foreground : true

    help: =>
        window.open(WIKI_HELP_URL, "_blank").focus()

    change_font_size: (delta, id) =>
        local      = @store.getIn('local_view_state')
        id        ?= local.get('active_id')
        font_size  = tree_ops.get_node(local.get('frame_tree'), id)?.get('font_size')
        if not font_size?
            font_size = @redux.getStore('account')?.get('font_size') ? 14
        font_size  += delta
        if font_size < 2
            font_size = 2
        @set_frame_tree(id:id, font_size:font_size)
        @_get_cm(id)?.focus()

    increase_font_size: (id) =>
        @change_font_size(1, id)

    decrease_font_size: (id) =>
        @change_font_size(-1, id)

    set_cm: (id, cm) =>
        sel = @_cm_selections?[id]
        if sel?
            # restore saved selections (cursor position, selected ranges)
            cm.setSelections(sel)

        if @_cm? and misc.len(@_cm) > 0
            @_cm[id] = cm
            return
        @_cm = {"#{id}": cm}
        @set_codemirror_to_syncstring()

    unset_cm: (id) =>
        cm = @_get_cm(id)
        if not cm?
            return
        if tree_ops.has_id(@store.getIn(['local_view_state', 'frame_tree']), id)
            # Save the selections, in case this editor
            # is displayed again.
            @_cm_selections ?= {}
            @_cm_selections[id] = cm.listSelections()
        delete @_cm?[id]

    # returns cm with given id or at least some cm, if any known.
    _get_cm: (id) =>
        @_cm ?= {}
        cm = @_cm[id] ? @_active_cm()
        if not cm?
            for id, v of @_cm
                return v
        return cm

    _active_cm: =>
        return @_cm?[@store.getIn(['local_view_state', 'active_id'])]

    focus: =>
        @_get_cm()?.focus()

    syncstring_save: =>
        @_syncstring?.save()
        @set_save_status()

    set_syncstring_to_codemirror: =>
        cm = @_get_cm()
        if not cm? or not @_syncstring?
            return
        @set_syncstring(cm.getValue())

    set_syncstring: (value) =>
        @_syncstring.from_str(value)
        # NOTE: above is the only place where syncstring is changed, and when *we* change syncstring,
        # no change event is fired.  However, derived classes may want to update some preview when
        # syncstring changes, so we explicitly emit a change here:
        @_syncstring.emit('change')

    set_codemirror_to_syncstring: =>
        cm = @_get_cm()
        if not cm? or not @_syncstring?
            return
        cm.setValueNoJump(@_syncstring.to_str())
        @set_save_status()

    exit_undo_mode: =>
        @_syncstring?.exit_undo_mode()

    # per-session sync-aware undo
    undo: (id) =>
        cm = @_get_cm(id)
        if not cm?
            return
        if not @_syncstring.in_undo_mode()
            @set_syncstring_to_codemirror()
        value = @_syncstring.undo().to_str()
        cm.setValueNoJump(value, true)
        cm.focus()
        @set_syncstring_to_codemirror()
        @_syncstring.save()

    # per-session sync-aware redo
    redo: (id) =>
        cm = @_get_cm(id)
        if not cm?
            return
        if not @_syncstring.in_undo_mode()
            return
        doc = @_syncstring.redo()
        if not doc?
            # can't redo if version not defined/not available.
            return
        value = doc.to_str()
        cm.setValueNoJump(value, true)
        cm.focus()
        @set_syncstring_to_codemirror()
        @_syncstring.save()

    find: (id) =>
        @_get_cm(id)?.execCommand('find')

    find_next: (id) =>
        @_get_cm(id)?.execCommand('findNext')

    find_prev:(id)  =>
        @_get_cm(id)?.execCommand('findPrev')

    replace: (id) =>
        @_get_cm(id)?.execCommand('replace')

    goto_line: (id) =>
        @_get_cm(id)?.execCommand('jumpToLine')

    auto_indent: (id) =>
        @_get_cm(id)?.execCommand('indentAuto')

    programmatical_goto_line: (line) =>  # used when clicking on other user avatar.
        cm = @_get_cm()
        if not cm?
            return
        pos  = {line:line-1, ch:0}
        info = cm.getScrollInfo()
        cm.scrollIntoView(pos, info.clientHeight/2)

    cut: (id) =>
        cm = @_get_cm(id)
        if cm?
            copypaste.set_buffer(cm.getSelection())
            cm.replaceSelection('')
            cm.focus()

    copy: (id) =>
        cm = @_get_cm(id)
        if cm?
            copypaste.set_buffer(cm.getSelection())
            cm.focus()

    paste: (id) =>
        cm = @_get_cm(id)
        if cm?
            cm.replaceSelection(copypaste.get_buffer())
            cm.focus()

    set_error: (error) =>
        @setState(error: error)

    print: (id) =>
        cm = @_get_cm()
        if not cm?
            return
        error = print.print
            value     : cm.getValue()
            options   : cm.options
            path      : @path
            font_size : @_get_frame_node(id)?.get('font_size')
        if error
            @setState(error: error)
        cm.focus()

    # Runs spellchecker on the backend last saved file, then
    # sets the mispelled_words part of the state to the immutable
    # Set of those words.  They can then be rendered by any editor/view.
    update_misspelled_words: =>
        spell_check.misspelled_words
            project_id : @project_id
            path       : @path
            cb         : (err, words) =>
                if err
                    @setState(error: err)
                else
                    words = immutable.Set(words)
                    if not words.equals(@store.get('misspelled_words'))
                        @setState(misspelled_words: words)
        return

    format_action: (cmd, args) =>
        cm = @_get_cm()
        if not cm?
            # format bar only makes sense when some cm is there...
            return
        ###  -- disabled; using codemirror pluging for now instead
        if cmd in ['link', 'image', 'SpecialChar']
            if @store.getIn(['format_bar', cmd])?
                # Doing the formatting action
                @format_dialog_action(cmd)
            else
                # This causes a dialog to appear, which will set relevant part of store and call format_action again
                @set_format_bar(cmd, {})
            return
        ###
        cm.edit_selection
            cmd  : cmd
            args : args
            cb   : =>
                if @_state != 'closed'
                    cm.focus()
                    @set_syncstring_to_codemirror()
                    @_syncstring.save()

    ###
    format_dialog_action: (cmd) ->
        state = @store.getIn(['format_bar', cmd])
        @set_format_bar(cmd)  # clear state for cmd.

    set_format_bar: (key, val) =>
        format_bar = @store.get('format_bar') ? immutable.Map()
        if not val?
            format_bar = format_bar.delete(key)
        else
            if not immutable.Map.isMap(val)
                val = immutable.fromJS(val)
            format_bar = format_bar.set(key, val)
        @setState(format_bar: format_bar)
    ###
