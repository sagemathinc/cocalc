{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

prompt = (state, exec_count) ->
    switch state
        when 'start'
            n = '⇐'
        when 'run'
            n = '⋯'
        when 'busy'
            n = '*'
        else  # done
            n = exec_count ? ' '
    return n

INPUT_STYLE =
    color        : '#303F9F'
    minWidth     : '14ex'
    fontFamily   : 'monospace'
    textAlign    : 'right'
    paddingRight : '.4em'

exports.InputPrompt = rclass
    propTypes:
        type       : rtypes.string
        state      : rtypes.string
        exec_count : rtypes.number

    render: ->
        if @props.type != 'code'
            return <div style={minWidth: '14ex', fontFamily: 'monospace'}></div>
        <div style={INPUT_STYLE}>
            In [{prompt(@props.state, @props.exec_count)}]:
        </div>

OUTPUT_STYLE =
    color         : '#D84315'
    minWidth      : '14ex'
    fontFamily    : 'monospace'
    textAlign     : 'right'
    padding       : '.4em'
    paddingBottom : 0

exports.OutputPrompt = rclass
    propTypes:
        state      : rtypes.string
        exec_count : rtypes.number
        start : rtypes.number
        end   : rtypes.number

    render: ->
        n = prompt(@props.state, @props.exec_count)
        if not n?
            return <div style={OUTPUT_STYLE}> </div>
        else
            <div style={OUTPUT_STYLE}>
                Out[{n}]:
            </div>

