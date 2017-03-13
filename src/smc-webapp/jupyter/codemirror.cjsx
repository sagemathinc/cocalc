###
Codemirror-based input cell

TODO:

 - [ ] need to merge in changes rather than just overwrite when get new changes from remote

###

{FormControl} = require('react-bootstrap')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

syncstring = require('smc-util/syncstring')

underscore = require('underscore')

EDITOR_STYLE =
    width        : '100%'
    overflowX    : 'hidden'
    border       : '1px solid #cfcfcf'
    borderRadius : '2px'
    background   : '#f7f7f7'
    lineHeight   : '1.21429em'

enable_folding = (options) ->
    options.extraKeys ?= {}
    options.extraKeys["Ctrl-Q"] = (cm) -> cm.foldCodeSelectionAware()
    options.foldGutter = true
    options.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]

exports.CodeMirrorEditor = rclass
    propTypes :
        actions  : rtypes.object.isRequired
        options  : rtypes.immutable.Map.isRequired
        value    : rtypes.string.isRequired
        id       : rtypes.string.isRequired
        font_size : rtypes.number # not used, but critical to re-render on change!

    shouldComponentUpdate: (next) ->
        return next.options != @props.options or next.value != @props.value or next.font_size != @props.font_size

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value)

    _cm_destroy: ->
        if @cm?
            @cm.toTextArea()
            if @_cm_change?
                @cm.off('change', @_cm_change)
                @cm.off('focus', @_cm_focus)
                @cm.off('blur', @_cm_blur)
                delete @_cm_change
            delete @_cm_last_remote
            delete @cm

    _cm_focus: ->
        @props.actions.set_mode('edit')

    _cm_blur: ->
        @props.actions.set_mode('escape')

    _cm_cursor: ->
        if @cm._setValueNoJump   # if true, cursor move is being caused by external setValueNoJump
            return
        locs = ({x:c.anchor.ch, y:c.anchor.line, id:@props.id} for c in @cm.listSelections())
        @props.actions.set_cursor_locs(locs)

    _cm_save: ->
        if not @cm?
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

    _cm_undo: ->
        if not @props.actions.syncdb.in_undo_mode() or @cm.getValue() != @_cm_last_remote
            @_cm_save()
        @props.actions.undo()

    _cm_redo: ->
        @props.actions.redo()

    init_codemirror: (options, value) ->
        @_cm_destroy()
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        options = options.toJS()
        enable_folding(options)
        @cm = CodeMirror.fromTextArea(node, options)
        $(@cm.getWrapperElement()).css(height: 'auto')
        @_cm_merge_remote(value)
        @_cm_change = underscore.debounce(@_cm_save, 1000)
        @cm.on('change', @_cm_change)
        @cm.on('focus' , @_cm_focus)
        @cm.on('blur'  , @_cm_blur)
        @cm.on('cursorActivity', @_cm_cursor)

        # replace undo/redo by our sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value)

    componentWillReceiveProps: (next) ->
        if not @cm? or not @props.options.equals(next.options) or @props.font_size != next.font_size
            @init_codemirror(next.options, next.value)
        else if next.value != @props.value
            @_cm_merge_remote(next.value)

    componentWillUnmount: ->
        if @cm?
            @_cm_save()
            doc = @cm.getDoc()
            delete doc.cm  # so @cm gets freed from memory when destroyed and doc is not attached to it.
            @_cm_destroy()

    render : ->
        <div style={EDITOR_STYLE}>
            <textarea />
        </div>