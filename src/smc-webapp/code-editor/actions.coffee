###
Editor Actions
###

WIKI_HELP_URL = "https://github.com/sagemathinc/cocalc/wiki/editor"  # TODO -- write this

immutable  = require('immutable')
underscore = require('underscore')
{Actions}  = require('../smc-react')
misc       = require('smc-util/misc')
keyboard   = require('./keyboard')
copypaste  = require('../copy-paste-buffer')
convert_to_pdf = require('./convert-to-pdf')
browser_print  = require('./browser-print')

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
        if true or not local_view_state.has("frame_tree")
            id = misc.uuid()
            #frame_tree = immutable.fromJS({id:id, type:'cm', path:@path})
            #frame_tree = immutable.fromJS({id:id, direction:'row', type:'frame_tree', first:{type:'cm', path:@path}, second:{type:'cm', path:@path}})
            #frame_tree = immutable.fromJS({pos:0.25, id:id, direction:'col', type:'frame_tree', first:{type:'cm', path:@path}, second:{type:'cm', path:@path}})
            #frame_tree = immutable.fromJS({pos:0.25, id:id, direction:'col', type:'frame_tree', first:{type:'cm', path:@path}, second:{id:'foo',direction:'col',type:'frame_tree',first:{type:'cm', path:@path},second:{type:'cm',path:@path}}})
            #frame_tree = immutable.fromJS({pos:0.25, id:id, direction:'col', type:'frame_tree', first:{type:'cm', path:@path}, second:{id:'foo',direction:'row',type:'frame_tree',first:{type:'cm', path:@path},second:{type:'cm',path:@path}}})
            frame_tree = immutable.fromJS({pos:0.25, id:id, direction:'row', type:'frame_tree', first:{type:'cm', path:@path}, second:{id:'foo',direction:'col',type:'frame_tree',first:{type:'cm', path:@path},second:{id:'foo2',direction:'row',type:'frame_tree',first:{type:'cm', path:@path},second:{type:'cm',path:@path}}}})
            local_view_state = local_view_state.set('frame_tree', frame_tree)
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

    set_frame_tree: (obj) =>
        id = obj.id
        if not id?  # id must be set
            return
        if misc.len(obj) < 2  # nothing to do
            return
        local = @store.get('local_view_state')
        tree0 = local.get('frame_tree')
        process = (node) =>
            if not node?
                return node
            if node.get('id') == id
                # it's the one -- change it
                for k, v of obj
                    if k != 'id'
                        node = node.set(k, immutable.fromJS(v))
                return node
            for x in ['first', 'second'] # binary tree...
                sub0 = node.get(x)
                sub1 = process(sub0)
                if sub0 != sub1 # changed
                    node = node.set(x, sub1)
            return node
        tree1 = process(tree0)
        if tree1 != tree0
            @setState(local_view_state : local.set('frame_tree', tree1))
        return

    save_scroll_position: (info) =>
        @set_local_view_state({scroll:info})

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
        @syncstring?.save_to_disk =>
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
        if not @syncstring.in_undo_mode()
            @set_syncstring_to_codemirror()
        value = @syncstring.undo().to_str()
        @cm.setValueNoJump(value)
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
        @cm.setValueNoJump(value)
        @set_syncstring_to_codemirror()
        @syncstring_save()

    find: =>
        @cm?.execCommand('find')

    find_next: =>
        @cm?.execCommand('findNext')

    find_prev: =>
        @cm?.execCommand('findPrev')

    replace: =>
        @cm?.execCommand('replace')

    goto_line: =>
        @cm?.execCommand('jumpToLine')

    split_view: =>
        console.log 'split_view, todo'

    cut: =>
        copypaste.set_buffer(@cm?.getSelection())
        @cm?.replaceSelection('')

    copy: =>
        copypaste.set_buffer(@cm?.getSelection())

    paste: =>
        @cm?.replaceSelection(copypaste.get_buffer())

    print: =>
        @setState(printing: true)
        convert_to_pdf.convert
            path  : @path
            cb    : (err, pdf) =>
                @setState(printing: false)
                if err
                    @setState(error: err)
                else
                    browser_print.print(pdf:pdf)
