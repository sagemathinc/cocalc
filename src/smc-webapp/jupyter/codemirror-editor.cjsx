###
Focused codemirror editor, which you can interactively type into.
###

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

underscore    = require('underscore')

syncstring    = require('smc-util/syncstring')
misc          = require('smc-util/misc')

{Complete} = require('./complete')

{Cursors} = require('./cursors')

FOCUSED_STYLE =
    width        : '100%'
    overflowX    : 'hidden'
    border       : '1px solid #cfcfcf'
    borderRadius : '2px'
    background   : '#f7f7f7'
    lineHeight   : '1.21429em'


exports.CodeMirrorEditor = rclass
    displayName : 'CodeMirrorEditor'

    propTypes :
        actions          : rtypes.object
        id               : rtypes.string.isRequired
        options          : rtypes.immutable.Map.isRequired
        value            : rtypes.string.isRequired
        font_size        : rtypes.number   # font_size not explicitly used, but it is critical
                                           # to re-render on change so Codemirror recomputes itself!
        cursors          : rtypes.immutable.Map
        set_click_coords : rtypes.func.isRequired
        click_coords     : rtypes.object  # coordinates if cell was just clicked on
        set_last_cursor  : rtypes.func.isRequired
        last_cursor      : rtypes.object
        is_focused       : rtypes.bool
        complete         : rtypes.immutable.Map

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value)

    _cm_destroy: ->
        if @cm?
            @props.actions?.unregister_input_editor(@props.id)
            delete @_cm_last_remote
            delete @cm.save
            if @_cm_change?
                @cm.off('change', @_cm_change)
                @cm.off('focus',  @_cm_focus)
                @cm.off('blur',   @_cm_blur)
                delete @_cm_change
            $(@cm.getWrapperElement()).remove()  # remove from DOM
            @cm.getOption('extraKeys')?.Tab = undefined  # no need to reference method of this react class
            delete @cm

    _cm_focus: ->
        @_cm_is_focused = true
        if not @cm? or not @props.actions?
            return
        @props.actions.unselect_all_cells()
        @props.actions.set_cur_id(@props.id)
        @props.actions.set_mode('edit')
        if @_vim_mode
            $(@cm.getWrapperElement()).css(paddingBottom:'1.5em')
        @_cm_cursor()

    _cm_blur: ->
        @_cm_is_focused = false
        if not @cm? or not @props.actions?
            return
        @props.set_last_cursor(@cm.getCursor())
        if @_vim_mode
            return
        if @_cm_blur_skip
            delete @_cm_blur_skip
            return
        @props.actions.set_mode('escape')

    _cm_cursor: ->
        if not @cm? or not @props.actions?
            return
        locs = ({x:c.anchor.ch, y:c.anchor.line, id:@props.id} for c in @cm.listSelections())
        @props.actions.set_cursor_locs(locs, @cm._setValueNoJump)

        # See https://github.com/jupyter/notebook/issues/2464 for discussion of this cell_list_top business.
        cell_list_top = @props.actions._cell_list_div?.offset().top
        if cell_list_top? and @cm.cursorCoords(true, 'window').top < cell_list_top
            scroll = @props.actions._cell_list_div.scrollTop()
            @props.actions._cell_list_div.scrollTop(scroll - (cell_list_top - @cm.cursorCoords(true, 'window').top) - 20)

        @set_hook_pos()

    set_hook_pos: ->
        if not @cm?
            return
        # Used for maintaining vertical scroll position with multiple simultaneous editors.
        offset = @cm.cursorCoords(true, 'local').top
        @props.actions.setState({hook_offset: offset})

    _cm_set_cursor: (pos) ->
        {x, y} = pos
        x ?= 0; y ?= 0   # codemirror tracebacks on undefined pos!
        if y < 0  # for getting last line...
            y = @cm.lastLine() + 1 + y
        @cm.setCursor({line:y, ch:x})

    _cm_save: ->
        if not @cm? or not @props.actions?
            return
        value = @cm.getValue()
        if value != @_cm_last_remote
            # only save if we actually changed something
            @_cm_last_remote = value
            # The true makes sure the Store has its state set immediately,
            # with no debouncing/throttling, etc., which is important
            # since some code, e.g., for introspection when doing evaluation,
            # which runs immediately after this, assumes the Store state
            # is set for the editor.
            @props.actions.set_cell_input(@props.id, value)
        return value

    _cm_merge_remote: (remote) ->
        if not @cm?
            return
        @_cm_last_remote ?= ''
        if @_cm_last_remote == remote
            return  # nothing to do
        local = @cm.getValue()
        new_val = syncstring.three_way_merge
            base   : @_cm_last_remote
            local  : local
            remote : remote
        @_cm_last_remote = remote
        @cm.setValueNoJump(new_val)
        @set_hook_pos()

    _cm_undo: ->
        if not @cm? or not @props.actions?
            return
        if not @props.actions.syncdb.in_undo_mode() or @cm.getValue() != @_cm_last_remote
            @_cm_save()
        @props.actions.undo()

    _cm_redo: ->
        if not @cm? or not @props.actions?
            return
        @props.actions.redo()

    shift_tab_key: ->
        @cm?.unindent_selection()

    tab_key: ->
        if not @cm?
            return
        if @cm.somethingSelected()
            CodeMirror.commands.defaultTab(@cm)
        else
            @tab_nothing_selected()

    up_key: ->
        if not @cm?
            return
        cur = @cm.getCursor()
        if cur?.line == @cm.firstLine() and cur?.ch == 0
            @adjacent_cell(-1, -1)
        else
            CodeMirror.commands.goLineUp(@cm)

    down_key: ->
        if not @cm?
            return
        cur = @cm.getCursor()
        n = @cm.lastLine()
        if cur?.line == n and cur?.ch == @cm.getLine(n)?.length
            @adjacent_cell(0, 1)
        else
            CodeMirror.commands.goLineDown(@cm)

    page_up_key: ->
        if not @cm?
            return
        cur = @cm.getCursor()
        if cur?.line == @cm.firstLine() and cur?.ch == 0
            @adjacent_cell(-1, -1)
        else
            CodeMirror.commands.goPageUp(@cm)

    page_down_key: ->
        if not @cm?
            return
        cur = @cm.getCursor()
        n = @cm.lastLine()
        if cur?.line == n and cur?.ch == @cm.getLine(n)?.length
            @adjacent_cell(0, 1)
        else
            CodeMirror.commands.goPageDown(@cm)

    adjacent_cell: (y, delta) ->
        @props.actions.move_cursor(delta)
        @props.actions.set_cursor(@props.actions.store.get('cur_id'), {x:0, y:y})

    tab_nothing_selected: ->
        if not @cm?
            return
        cur  = @cm.getCursor()
        if cur.ch == 0 or /\s/.test(@cm.getLine(cur.line)[cur.ch - 1])  # whitespace before cursor
            if @cm.options.indentWithTabs
                CodeMirror.commands.defaultTab(@cm)
            else
                @cm.tab_as_space()
            return
        pos    = @cm.cursorCoords(cur, 'local')
        top    = pos.bottom
        left   = pos.left
        gutter = $(@cm.getGutterElement()).width()
        @props.actions.complete(@cm.getValue(), cur, @props.id, {top:top, left:left, gutter:gutter})

    update_codemirror_options: (next, current) ->
        next.forEach (value, option) =>
            if value != current.get(option)
                value = value?.toJS?() ? value
                @cm.setOption(option, value)
            return

    init_codemirror: (options, value) ->
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        if not node?
            return
        options0 = options.toJS()
        if @props.actions?
            options0.extraKeys             ?= {}
            options0.extraKeys["Shift-Tab"] = @shift_tab_key
            options0.extraKeys["Tab"]       = @tab_key
            options0.extraKeys["Up"]        = @up_key
            options0.extraKeys["Down"]      = @down_key
            options0.extraKeys["PageUp"]    = @page_up_key
            options0.extraKeys["PageDown"]  = @page_down_key
            options0.extraKeys["Cmd-/"]     = "toggleComment"
            options0.extraKeys["Ctrl-/"]    = "toggleComment"
        else
            options0.readOnly = true

        ###
        # Disabled for efficiency reasons:
        #   100% for speed reasons, we only use codemirror for cells with cursors
        #   or the active cell, so don't want to show a gutter.
        if options0.foldGutter
            options0.extraKeys["Ctrl-Q"] = (cm) -> cm.foldCodeSelectionAware()
            options0.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]  # TODO: if we later change options to disable folding, the gutter still remains in the editors.
        ###

        @cm = CodeMirror.fromTextArea(node, options0)
        @cm.save = => @props.actions.save()
        if @props.actions? and options0.keyMap == 'vim'
            @_vim_mode = true
            @cm.on 'vim-mode-change', (obj) =>
                if obj.mode == 'normal'
                    # The timeout is because this must not be set when the general
                    # keyboard handler for the whole editor gets called with escape.
                    # This is ugly, but I'm not going to spend forever on this before
                    # the #v1 release, as vim support is a bonus feature.
                    setTimeout((=>@props.actions.setState(cur_cell_vim_mode: 'escape')), 0)
                else
                    @props.actions.setState(cur_cell_vim_mode: 'edit')
        else
            @_vim_mode = false

        css = {height: 'auto'}
        if not options0.theme?
            css.backgroundColor = '#f7f7f7'  # this is what official jupyter looks like...
        $(@cm.getWrapperElement()).css(css)

        @_cm_last_remote = value
        @cm.setValue(value)

        @_cm_change = underscore.debounce(@_cm_save, 1000)
        @cm.on('change', @_cm_change)
        @cm.on('focus' , @_cm_focus)
        @cm.on('blur'  , @_cm_blur)
        @cm.on('cursorActivity', @_cm_cursor)

        # replace undo/redo by our sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

        if @props.actions?
            editor =
                save        : @_cm_save
                set_cursor  : @_cm_set_cursor
                tab_key     : @tab_key
            @props.actions.register_input_editor(@props.id, editor)

        if @props.click_coords?
            # editor clicked on, so restore cursor to that position
            @cm.setCursor(@cm.coordsChar(@props.click_coords, 'window'))
            @props.set_click_coords()  # clear them

        else if @props.last_cursor?
            @cm.setCursor(@props.last_cursor)
            @props.set_last_cursor()

        # Finally, do a refresh in the next render loop, once layout is done.
        # See https://github.com/sagemathinc/cocalc/issues/2397
        # Note that this also avoids a significant disturbing flicker delay
        # even for non-raw cells.  This obviously probably slows down initial
        # load or switch to of the page, unfortunately.  Such is life.
        # CRITICAL: Also do the focus only after the refresh, or when
        # switching from static to non-static, whole page gets badly
        # repositioned (see https://github.com/sagemathinc/cocalc/issues/2548).
        setTimeout((=>@cm?.refresh(); if @props.is_focused then @cm?.focus()),1)

    componentWillReceiveProps: (next) ->
        if not @cm?
            @init_codemirror(next.options, next.value)
            return
        if not @props.options.equals(next.options)
            @update_codemirror_options(next.options, @props.options)
        if @props.font_size != next.font_size
            @cm.refresh()
        if next.value != @props.value
            @_cm_merge_remote(next.value)
        if next.is_focused and not @props.is_focused
            # gain focus
            @cm?.focus()
        if not next.is_focused and @_cm_is_focused
            # controlled loss of focus from store; we have to force
            # this somehow.  Note that codemirror has no .blur().
            # See http://codemirror.977696.n3.nabble.com/Blur-CodeMirror-editor-td4026158.html
            setTimeout((=>@cm?.getInputField().blur()), 1)
        if @_vim_mode and not next.is_focused and @props.is_focused
            $(@cm.getWrapperElement()).css(paddingBottom:0)


    componentWillUnmount: ->
        if @cm?
            @_cm_save()
            @_cm_destroy()

    render_complete: ->
        if @props.complete?
            if @props.complete.get('matches')?.size > 0
                <Complete
                    complete = {@props.complete}
                    actions  = {@props.actions}
                    id       = {@props.id}
                />

    render_cursors: ->
        if @props.cursors?
            <Cursors
                cursors    = {@props.cursors}
                codemirror = {@cm} />

    render : ->
        <div style={width:'100%', overflow:'auto'}>
            {@render_cursors()}
            <div style={FOCUSED_STYLE}>
                <textarea />
            </div>
            {@render_complete()}
        </div>

