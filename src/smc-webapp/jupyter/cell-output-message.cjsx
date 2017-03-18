misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{ImmutablePureRenderMixin} = require('../r_misc')

LEFT='17px'

STDOUT_STYLE =
    whiteSpace  : 'pre-wrap'
    fontFamily  : 'monospace'
    paddingTop  : '5px'
    paddingLeft : LEFT

STDERR_STYLE = misc.merge({backgroundColor:'#fdd'}, STDOUT_STYLE)

Stdout = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    mixins: [ImmutablePureRenderMixin]

    render: ->
        <div style={STDOUT_STYLE}>
            {@props.message.get('text')}
        </div>

Stderr = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    mixins: [ImmutablePureRenderMixin]

    render: ->
        <div style={STDERR_STYLE}>
            {@props.message.get('text')}
        </div>

Data = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    mixins: [ImmutablePureRenderMixin]

    render: ->
        text = @props.message.getIn(['data', 'text/plain'])
        if text?
            <div style={STDOUT_STYLE}>
                {text}
            </div>
        else
            <pre>Unsupported message: {text}</pre>

NotImplemented = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    mixins: [ImmutablePureRenderMixin]

    render: ->
        <pre style={STDERR_STYLE}>
            {JSON.stringify(@props.message.toJS())}
        </pre>

message_component = (message) ->
    name = message.get('name')
    if name == 'stdout'
        return Stdout
    else if name == 'stderr'
        return Stderr
    data = message.get('data')
    if data?
        return Data
    return NotImplemented

CellOutputMessage = rclass
    propTypes :
        message : rtypes.immutable.Map.isRequired

    mixins: [ImmutablePureRenderMixin]

    render: ->
        C = message_component(@props.message)
        <C message={@props.message} />

exports.CellOutputMessages = rclass
    propTypes :
        output : rtypes.immutable.Map.isRequired  # the actual messages

    shouldComponentUpdate: (next) ->
        return next.output != @props.output

    render_output_message: (n, mesg) ->
        if not mesg?
            return
        <CellOutputMessage
            key     = {n}
            message = {mesg}
        />

    message_list: ->
        v = []
        k = 0
        # combine stdout and stderr messages...
        for n in [0...@props.output.size]
            mesg = @props.output.get("#{n}")
            name = mesg.get('name')
            if k > 0 and (name == 'stdout' or name == 'stderr') and v[k-1].get('name') == name
                v[k-1] = v[k-1].set('text', v[k-1].get('text') + mesg.get('text'))
            else
                v[k] = mesg
                k += 1
        return v

    render: ->
        v = (@render_output_message(n, mesg) for n, mesg of @message_list())
        <div style={width:'100%', lineHeight:'normal', backgroundColor: '#fff', border: 0, marginBottom:0}>
            {v}
        </div>
