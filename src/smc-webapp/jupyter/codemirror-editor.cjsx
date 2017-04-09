###
Focused codemirror editor, which you can interactively type into.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

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

    reduxProps:
        account :
            editor_settings : rtypes.immutable.Map

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value, @props.cursors)

    _cm_destroy: ->
        if @cm?
            @props.actions?.unregister_input_editor(@props.id)
            delete @_cm_last_remote
            if @_cm_change?
                @cm.off('change', @_cm_change)
                @cm.off('focus',  @_cm_focus)
                @cm.off('blur',   @_cm_blur)
                delete @_cm_change
            $(@cm.getWrapperElement()).remove()  # remove from DOM
            @cm.getOption('extraKeys').Tab = undefined  # no need to point at method of this react class
            delete @cm

    _cm_focus: ->
        @_cm_is_focused = true
        if not @cm? or not @props.actions?
            return
        @props.actions.set_mode('edit')
        @props.actions.unselect_all_cells()
        @props.actions.set_cur_id(@props.id)
        @_cm_cursor()

    _cm_blur: ->
        @_cm_is_focused = false
        if not @cm? or not @props.actions?
            return
        @props.set_last_cursor(@cm.getCursor())
        @props.actions.set_mode('escape')

    _cm_cursor: ->
        if not @cm? or not @props.actions?
            return
        if @cm._setValueNoJump   # if true, cursor move is being caused by external setValueNoJump
            return
        locs = ({x:c.anchor.ch, y:c.anchor.line, id:@props.id} for c in @cm.listSelections())
        @props.actions.set_cursor_locs(locs)

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
        if @_cm_last_remote?
            if @_cm_last_remote == remote
                return  # nothing to do
            local = @cm.getValue()
            new_val = syncstring.three_way_merge
                base   : @_cm_last_remote
                local  : local
                remote : remote
        else
            new_val = remote
        @_cm_last_remote = new_val
        @cm.setValueNoJump(new_val)

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

    tab_key: ->
        if not @props.actions? or not @cm?
            return
        if @cm.somethingSelected()
            CodeMirror.commands.defaultTab(@cm)
        else
            @tab_nothing_selected()

    tab_nothing_selected: ->
        if not @cm?
            return
        cur  = @cm.getCursor()
        if cur.ch == 0 or /\s/.test(@cm.getLine(cur.line)[cur.ch - 1])  # whitespace before cursor
            CodeMirror.commands.defaultTab(@cm)
            return
        pos    = @cm.cursorCoords(cur, 'local')
        top    = pos.bottom - @cm.getScrollInfo().height
        left   = pos.left
        gutter = $(@cm.getGutterElement()).width()
        @props.actions.complete(@cm.getValue(), cur, @props.id, {top:top, left:left, gutter:gutter})

    init_codemirror: (options, value, cursors) ->
        @_cm_destroy()
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        if not node?
            return
        options0 = options.toJS()
        if @props.actions?
            options0.extraKeys ?= {}
            options0.extraKeys["Tab"] = @tab_key
        else
            options0.readOnly = true
        options0.autoCloseBrackets = @props.editor_settings.get('auto_close_brackets')

        @cm = CodeMirror.fromTextArea(node, options0)
        $(@cm.getWrapperElement()).css(height: 'auto', backgroundColor:'#f7f7f7')

        @_cm_merge_remote(value)
        @_cm_change = underscore.debounce(@_cm_save, 1000)
        @cm.on('change', @_cm_change)
        @cm.on('focus' , @_cm_focus)
        @cm.on('blur'  , @_cm_blur)
        @cm.on('cursorActivity', @_cm_cursor)

        # replace undo/redo by our sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

        if @props.actions?
            @props.actions.register_input_editor(@props.id, (=> @_cm_save()))

        if @props.is_focused
            @cm.focus()

        if @props.click_coords?
            # editor clicked on, so restore cursor to that position
            @cm.setCursor(@cm.coordsChar(@props.click_coords, 'window'))
            @props.set_click_coords()  # clear them
        else if @props.last_cursor?
            @cm.setCursor(@props.last_cursor)
            @props.set_last_cursor()

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value, @props.cursors)

    componentWillReceiveProps: (next) ->
        if not @cm? or not @props.options.equals(next.options) or \
                @props.font_size != next.font_size or \
                not @props.editor_settings?.equals(next.editor_settings)
            @init_codemirror(next.options, next.value, next.cursors)
            return
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

###
enable_folding = (options) ->
    options.extraKeys["Ctrl-Q"] = (cm) -> cm.foldCodeSelectionAware()
    options.foldGutter = true
    options.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]
###