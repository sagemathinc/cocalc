{FormControl} = require('react-bootstrap')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

exports.InputEditor = rclass
    propTypes :
        value    : rtypes.string
        style    : rtypes.object
        onChange : rtypes.func.isRequired

    handle_change: (e) ->
        @props.onChange(e.target.value)

    render : ->
        <FormControl
            componentClass = 'textarea'
            value          = {@props.value}
            style          = {@props.style}
            onChange       = {@handle_change}
        />