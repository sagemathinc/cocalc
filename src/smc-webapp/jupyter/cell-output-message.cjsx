{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

Stdout = rclass
    propTypes :
        text : rtypes.string.isRequired

    render: ->
        <span style={whiteSpace: 'pre-wrap', fontFamily:'monospace'}>
            {@props.text}
        </span>


exports.CellOutputMessage = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (next) ->
        return next.message != @props.message

    render: ->
        name = @props.message.get('name')
        if name == 'stdout'
            return <Stdout text={@props.message.get('text')} />

        <pre>
            {JSON.stringify(@props.message.toJS())}
        </pre>