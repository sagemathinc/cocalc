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
    marginRight  : '3px'

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
    paddingRight  : '.4em'
    paddingBottom : '2px'

exports.OutputPrompt = rclass
    propTypes:
        state      : rtypes.string
        exec_count : rtypes.number
        collapsed  : rtypes.bool

    render: ->
        if @props.collapsed or not @props.exec_count
            n = undefined
        else
            n = prompt(@props.state, @props.exec_count)
        if not n?
            return <div style={OUTPUT_STYLE}> </div>
        else
            <div style={OUTPUT_STYLE}>
                Out[{n}]:
            </div>

