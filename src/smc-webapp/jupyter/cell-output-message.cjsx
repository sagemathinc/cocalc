misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

LEFT='17px'

STDOUT_STYLE =
    whiteSpace  : 'pre-wrap'
    fontFamily  : 'monospace'
    paddingTop  : '5px'
    paddingLeft : LEFT

STDERR_STYLE = misc.merge({backgroundColor:'#fdd'}, STDOUT_STYLE)

Stdout = rclass
    propTypes :
        text : rtypes.string.isRequired

    render: ->
        <div style={STDOUT_STYLE}>
            {@props.text}
        </div>

Stderr = rclass
    propTypes :
        text : rtypes.string.isRequired

    render: ->
        <div style={STDERR_STYLE}>
            {@props.text}
        </div>

Data = rclass
    propTypes :
        data : rtypes.immutable.Map.isRequired

    render: ->
        text = @props.data.get('text/plain')
        if text?
            <div style={STDOUT_STYLE}>
                {text}
            </div>
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
        else if name == 'stderr'
            return <Stderr text={@props.message.get('text')} />

        data = @props.message.get('data')
        if data?
            return <Data data={data} />

        <pre>
            {JSON.stringify(@props.message.toJS())}
        </pre>