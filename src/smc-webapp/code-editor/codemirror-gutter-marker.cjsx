###
React component that represents gutter markers in a codemirror editor.
###

{Fragment, React, ReactDOM, rclass, rtypes}  = require('../smc-react')
misc = require('misc')

exports.GutterMarker = rclass
    propTypes:
        line       : rtypes.number.isRequired         # line where it is initially placed -- will of course change as doc changes
        codemirror : rtypes.object.isRequired         # codemirror editor instance
        gutter_id  : rtypes.string.isRequired
        set_handle : rtypes.func.isRequired

    shouldComponentUpdate: (props) ->
        return misc.is_different(@props, props, ['line', 'gutter_id'])

    componentDidMount: ->
        @init_gutter(@props.codemirror)

    init_gutter: (codemirror) ->
        @_elt = document.createElement("div")
        ReactDOM.render(<div>{@props.children}</div>, @_elt)
        @_handle = @props.codemirror.setGutterMarker(@props.line, @props.gutter_id, @_elt)
        @props.set_handle(@_handle)
        console.log 'made gutter mark ', @_handle

    componentWillUnmount: ->
        if @_elt?
            ReactDOM.unmountComponentAtNode(@_elt)
            @_elt.remove()
            delete @_elt
        if @_handle?
            console.log 'clearing gutter mark ', @_handle
            @props.codemirror.setGutterMarker(@_handle, @props.gutter_id, null)
            delete @_handle

    render: ->
        console.log 'render gutter marker', @props.gutter_id, @props.line
        <span />
