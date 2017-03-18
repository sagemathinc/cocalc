{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

Stdout = rclass
    propTypes :
        text : rtypes.string.isRequired

    render: ->
        <span style={whiteSpace: 'pre-wrap', fontFamily:'monospace'}>
            {@props.text}
        </span>

Data = rclass
    propTypes :
        data : rtypes.immutable.Map.isRequired

    render: ->
        text = @props.data.get('text/plain')
        if text?
            <span style={whiteSpace: 'pre-wrap', fontFamily:'monospace'}>
                {text}
            </span>
        else
            <pre>Unsupported message: {text}</pre>

exports.CellOutputMessage = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (next) ->
        return next.message != @props.message

    render: ->
        name = @props.message.get('name')
        if name == 'stdout'
            return <Stdout text={@props.message.get('text')} />

        data = @props.message.get('data')
        if data?
            return <Data data={data} />

        <pre>
            {JSON.stringify(@props.message.toJS())}
        </pre>