###
Components related to toggling the way output is displayed.
###

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{Icon} = require('../r_misc')


misc = require('smc-util/misc')

SCROLLED_STYLE =
    fontSize      : 'inherit'
    padding       : 0
    display       : 'flex'   # flex used to move output prompt to bottom.
    flexDirection : 'column'

NORMAL_STYLE = misc.merge({borderColor:'transparent'}, SCROLLED_STYLE)

exports.OutputToggle = rclass
    propTypes:
        actions  : rtypes.object
        id       : rtypes.string.isRequired
        scrolled : rtypes.bool

    toggle_scrolled: ->
        @props.actions?.toggle_output(@props.id, 'scrolled')

    collapse_output: ->
        @props.actions?.toggle_output(@props.id, 'collapsed')

    render: ->
        # We use a bootstrap button for the output toggle area, but disable the padding
        # and border. This looks pretty good and consistent and clean.
        <div
            className     = 'btn btn-default'
            style         = {if @props.scrolled then SCROLLED_STYLE else NORMAL_STYLE}
            onClick       = {@toggle_scrolled}
            onDoubleClick = {@collapse_output}
            >
            <div style={flex:1}></div>     {### use up all space ###}
            {@props.children}
        </div>



exports.CollapsedOutput = rclass
    propTypes:
        actions  : rtypes.object
        id       : rtypes.string.isRequired

    show_output: ->
        @props.actions?.toggle_output(@props.id, 'collapsed')

    render: ->
        # We use a bootstrap button for the output toggle area, but disable the padding
        # and border. This looks pretty good and consistent and clean.
        <div
            className = 'btn btn-default'
            onClick   = {@show_output}
            style     = {textAlign:'center', width:'100%', color:'#777', padding:0}
            >
            <Icon name='ellipsis-h'/>
        </div>
