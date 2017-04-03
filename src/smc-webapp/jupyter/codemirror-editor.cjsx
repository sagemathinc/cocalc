###
Focused codemirror editor, which you can interactively type into.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

underscore    = require('underscore')

syncstring    = require('smc-util/syncstring')
misc          = require('smc-util/misc')


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

    reduxProps:
        account :
            editor_settings : rtypes.immutable.Map

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value, @props.cursors)

    _cm_destroy: ->
        if @cm?
            @cm.toTextArea()
            if @_cm_change?
                @cm.off('change', @_cm_change)
                @cm.off('focus',  @_cm_focus)
                @cm.off('blur',   @_cm_blur)
                delete @_cm_change
            delete @_cm_last_remote
            delete @cm
            @props.actions?.unregister_input_editor(@props.id)

    _cm_focus: ->
        if not @cm? or not @props.actions?
            return
        @props.actions.set_mode('edit')
        @props.actions.unselect_all_cells()
        @props.actions.set_cur_id(@props.id)
        @_cm_cursor()

    _cm_blur: ->
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
            @props.actions.set_cell_input(@props.id, value)

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

    _cm_update_cursors: (cursors) ->
        if not @cm?
            return
        now = misc.server_time()
        cursors?.forEach (locs, account_id) =>
            v = []
            locs.forEach (loc) =>
                if now - loc.get('time') <= 15000
                    v.push({x:loc.get('x'), y:loc.get('y')})
                return
            @draw_other_cursors(@cm, account_id, v)

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
        pos  = @cm.cursorCoords(cur, 'local')
        top  = pos.bottom - @cm.getScrollInfo().height
        left = pos.left
        @props.actions.complete(@cm.getValue(), cur, @props.id, {top:top, left:left})

    init_codemirror: (options, value, cursors) ->
        @_cm_destroy()
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        options = options.toJS()
        if @props.actions?
            options.extraKeys ?= {}

            #enable_folding(options)  # too hard to get margins right, save state; unify with blurred...
                                      # for now; maybe enable per cell optionally...
            options.extraKeys["Tab"] = @tab_key
        else
            options.readOnly = true

        options.autoCloseBrackets = @props.editor_settings.get('auto_close_brackets')

        @cm = CodeMirror.fromTextArea(node, options)
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

        @_cm_update_cursors(cursors)

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
        if next.cursors != @props.cursors
            @_cm_update_cursors(next.cursors)

    componentWillUnmount: ->
        if @cm?
            @_cm_save()
            doc = @cm.getDoc()
            delete doc.cm  # so @cm gets freed from memory when destroyed and doc is not attached to it.
            @_cm_destroy()

    # TODO: this is very ugly -- must rewrite below using React.
    draw_other_cursors: (cm, account_id, locs) ->
        if not cm? or not @props.actions?
            return
        @_cursors ?= {}
        users = @props.actions.redux.getStore('users')
        x = @_cursors[account_id]
        if not x?
            x = @_cursors[account_id] = []

        # First draw/update all current cursors
        templates = $(".smc-jupyter-templates")
        for [i, loc] in misc.enumerate(locs)
            pos   = {line:loc.y, ch:loc.x}
            index = loc.i # cell index
            data  = x[i]
            name  = misc.trunc(users.get_first_name(account_id), 10)
            color = users.get_color(account_id)
            if not data?
                cursor = templates.find(".smc-jupyter-cursor").clone().show()
                cursor.css({opacity:.7})
                cursor.find(".smc-jupyter-cursor-label").css( top:'-1.8em', 'padding-left':'.5ex', 'padding-right':'.5ex', 'padding-top':'.6ex', position:'absolute', width:'16ex')
                cursor.find(".smc-jupyter-cursor-inside").css(top:'-1.2em', position:'absolute')
                data = x[i] = {cursor: cursor}
            if name != data.name
                data.cursor.find(".smc-jupyter-cursor-label").text(name)
                data.name = name
            if color != data.color
                data.cursor.find(".smc-jupyter-cursor-inside").css('border-left': "1px solid #{color}")
                data.cursor.find(".smc-jupyter-cursor-label" ).css(background: color)
                data.color = color

            # Place cursor in the editor in the right spot
            cm.addWidget(pos, data.cursor[0], false)

            # Update cursor fade-out
            # LABEL: first fade the label out over 10s
            data.cursor.find(".smc-jupyter-cursor-label").stop().animate(opacity:1).show().fadeOut(duration:10000)
            # CURSOR: then fade the cursor out (a non-active cursor is a waste of space) over 20s.
            data.cursor.find(".smc-jupyter-cursor-inside").stop().animate(opacity:1).show().fadeOut(duration:20000)

        if x.length > locs.length
            # Next remove any cursors that are no longer there (e.g., user went from 5 cursors to 1)
            for i in [locs.length...x.length]
                x[i].cursor.remove()
            @_cursors[account_id] = x.slice(0, locs.length)

    render : ->
        <div style={FOCUSED_STYLE}>
            <textarea />
        </div>

###
enable_folding = (options) ->
    options.extraKeys["Ctrl-Q"] = (cm) -> cm.foldCodeSelectionAware()
    options.foldGutter = true
    options.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]
###