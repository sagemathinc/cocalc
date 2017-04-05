###
React component that represents line numbers for a static rendered
codemirror editor

###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc = require('smc-util/misc')

LINE_NUMBER_STYLE =
    color        : '#999'
    paddingTop   : '4px'
    height       : 'auto'
    textAlign    : 'right'
    lineHeight   : 'normal'
    fontFamily   : 'monospace'
    paddingLeft  : '4px'
    paddingRight : '3px'
    borderLeft   : '1px solid #cfcfcf'
    borderTop    : '1px solid #cfcfcf'
    borderBottom : '1px solid #cfcfcf'
    whiteSpace   : 'pre'

exports.LineNumbers = rclass
    propTypes:
        num_lines : rtypes.number.isRequired
        style     : rtypes.object

    render_lines: ->
        for n in [1..@props.num_lines]
            <div key={n}>
                {if n>=10 then n else " #{n}"}
            </div>

    render: ->
        if @props.style
            style = misc.merge(misc.copy(LINE_NUMBER_STYLE), @props.style)
        else
            style = LINE_NUMBER_STYLE
        <div style={style}>
            {@render_lines()}
        </div>
