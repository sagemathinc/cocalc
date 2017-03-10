###
Codemirror-based input cell

TODO:

 - [ ] need to merge in changes rather than just overwrite when get new changes from remote

###

{FormControl} = require('react-bootstrap')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

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
        options  : rtypes.object
        value    : rtypes.string.isRequired
        onChange : rtypes.func.isRequired

    handle_change: (e) ->
        @props.onChange(e.target.value)

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value)

    _cm_destroy: ->
        if @cm?
            @cm.toTextArea()
            if @_cm_change?
                @cm.off('change', @_cm_change)
                delete @_cm_change
            delete @cm

    init_codemirror: (options, value) ->
        @_cm_destroy()
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        @cm = CodeMirror.fromTextArea(node, options)
        @cm.setValueNoJump(value)
        $(@cm.getWrapperElement()).css(height: 'auto')
        f = =>
            @props.onChange(@cm.getValue())
        @_cm_change = underscore.debounce(f, 2000)
        @cm.on('change', @_cm_change)

    componentDidMount: ->
        @init_codemirror(@props.options, @props.value)

    componentWillReceiveProps: (newProps) ->
        if not @cm? or not underscore.isEqual(@props.options, newProps.options)
            @init_codemirror(newProps.options, newProps.value)
        else if newProps.value != @props.value
            @cm?.setValueNoJump(newProps.value)

    componentWillUnmount: ->
        if @cm?
            doc = @cm.getDoc()
            delete doc.cm  # so @cm gets freed from memory when destroyed and doc is not attached to it.
            @_cm_destroy()

    render : ->
        <div style={CELL_STYLE}>
            <textarea />
        </div>