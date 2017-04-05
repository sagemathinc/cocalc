"""
Components for rendering input and output prompts.
"""

{Icon, TimeAgo, Tip} = require('../r_misc')
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc = require('smc-util/misc')

INPUT_STYLE =
    color        : '#303F9F'
    minWidth     : '14ex'
    fontFamily   : 'monospace'
    textAlign    : 'right'
    paddingRight : '.4em'
    marginRight  : '3px'
    cursor       : 'pointer'

exports.InputPrompt = rclass
    propTypes:
        type       : rtypes.string
        state      : rtypes.string
        exec_count : rtypes.number
        kernel     : rtypes.string
        start      : rtypes.number
        end        : rtypes.number

    render: ->
        if @props.type != 'code'
            return <div style={minWidth: '14ex', fontFamily: 'monospace'}></div>

        kernel = misc.capitalize(@props.kernel ? '')

        switch @props.state
            when 'start'
                n = <Icon name='arrow-circle-o-left' style={fontSize:'80%'} />
                tip = "Sending to be evaluated using #{kernel}."
            when 'run'
                n = <Icon name='circle-o'  style={fontSize:'80%'} />
                tip = "Waiting for another computation to finish first. Will evaluate using #{kernel}."
            when 'busy'
                n = <Icon name='circle'  style={fontSize:'80%'}/>
                if @props.start?
                    tip = <span>Running since <TimeAgo date = {new Date(@props.start)} /> using {kernel}.</span>
                else
                    tip = "Running using #{kernel}."
            else  # done (or never run)
                if @props.exec_count
                    n = @props.exec_count
                    if @props.end?
                        tip = <span>Evaluated <TimeAgo date = {new Date(@props.end)} /> using {kernel}.</span>
                    else
                        tip = "Last evaluated using #{kernel}."
                else
                    n = ' '
                    tip = "Enter code to be evaluated."

        <div style={INPUT_STYLE}>
            <Tip
                title     = {'Code Cell'}
                tip       = {tip}
                placement = 'right'>
                In [{n}]:
            </Tip>
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
            n = @props.exec_count ? ' '
        if not n?
            return <div style={OUTPUT_STYLE}> </div>
        else
            <div style={OUTPUT_STYLE}>
                Out[{n}]:
            </div>

