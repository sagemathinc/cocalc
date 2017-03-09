{FormControl} = require('react-bootstrap')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

underscore = require('underscore')

exports.InputEditor = rclass
    propTypes :
        options  : rtypes.object
        style    : rtypes.object
        value    : rtypes.string
        onChange : rtypes.func.isRequired

    handle_change: (e) ->
        @props.onChange(e.target.value)

    componentDidMount: ->
        # console.log("componentDidMount")
        @init_codemirror(@props.options, @props.style, @props.value)

    _cm_destroy: ->
        if @cm?
            @cm.toTextArea()
            @cm.off('change', @_cm_change)
            delete @cm

    init_codemirror: (options, style, value) ->
        # console.log("init_codemirror", options)
        @_cm_destroy()

        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        @cm = CodeMirror.fromTextArea(node, options)
        if @props.doc?
            @cm.swapDoc(@props.doc)
        @cm.setValueNoJump(value)
        if style?
            $(@cm.getWrapperElement()).css(style)

        @cm.on('change', @_cm_change)

    _cm_change: ->
        # console.log("_cm_change")
        @_cm_set_value = @cm.getValue()
        @props.onChange(@_cm_set_value)

    componentDidMount: ->
        # console.log("componentDidMount")
        @init_codemirror(@props.options, @props.style, @props.value)

    componentWillReceiveProps: (newProps) ->
        if not @cm? or not underscore.isEqual(@props.options, newProps.options) or not underscore.isEqual(@props.style, newProps.style)
            @init_codemirror(newProps.options, newProps.style, newProps.value)
        else if newProps.value != @props.value and newProps.value != @_cm_set_value
            @cm?.setValueNoJump(newProps.value)

    componentWillUnmount: ->
        # console.log("componentWillUnmount")
        if @cm?
            doc = @cm.getDoc()
            delete doc.cm  # so @cm gets freed from memory when destroyed and doc is not attached to it.
            @_cm_destroy()

    render : ->
        <div>
            <textarea />
        </div>