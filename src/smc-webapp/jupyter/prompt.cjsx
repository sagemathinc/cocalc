{Icon, Tip} = require('../r_misc')
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

prompt = (state, exec_count) ->
    switch state
        when 'start'
            n = <Icon name='arrow-circle-o-left' style={fontSize:'80%'} />
            tip = "Sending to be computed"
        when 'run'
            n = <Icon name='circle-o'  style={fontSize:'80%'} />
            tip = "Waiting for another computation to finish first"
        when 'busy'
            n = <Icon name='circle'  style={fontSize:'80%'}/>
            tip = "Running right now"
        else  # done
            n = exec_count ? ' '
            tip = "Done"
    return {n: n, tip:tip}

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
        {n, tip} = prompt(@props.state, @props.exec_count)
        <Tip title={tip}>
            <div style={INPUT_STYLE}>
                In [{n}]:
            </div>
        </Tip>

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
            n = @props.exec_count ? ' '
        if not n?
            return <div style={OUTPUT_STYLE}> </div>
        else
            <div style={OUTPUT_STYLE}>
                Out[{n}]:
            </div>

