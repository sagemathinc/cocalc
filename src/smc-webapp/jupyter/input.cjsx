###
Codemirror-based input cell

TODO:

 - [ ] need to merge in changes rather than just overwrite when get new changes from remote

###

{FormControl} = require('react-bootstrap')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

syncstring = require('smc-util/syncstring')

underscore = require('underscore')

CELL_STYLE =
    width        : '100%'
    overflowX    : 'hidden'
    border       : '1px solid #cfcfcf'
    borderRadius : '2px'
    background   : '#f7f7f7'
    lineHeight   : '1.21429em'

exports.InputEditor = rclass
    propTypes :
        actions  : rtypes.object.isRequired
        options  : rtypes.immutable.Map.isRequired
        value    : rtypes.string.isRequired
        id       : rtypes.string.isRequired

    shouldComponentUpdate: (next) ->
        return next.options != @props.options or next.value != @props.value

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

    init_codemirror: (options, value) ->
        @_cm_destroy()
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        @cm = CodeMirror.fromTextArea(node, options.toJS())
        $(@cm.getWrapperElement()).css(height: 'auto')
        @_cm_merge_remote(value)
        @_cm_change = underscore.debounce(@_cm_save, 1000)
        @cm.on('change', @_cm_change)
        @cm.on('focus' , @_cm_focus)
        @cm.on('blur'  , @_cm_blur)

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value)

    componentWillReceiveProps: (next) ->
        if not @cm? or not @props.options.equals(next.options)
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
        <div style={CELL_STYLE}>
            <textarea />
        </div>