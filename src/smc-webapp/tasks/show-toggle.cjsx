###
Toggle whether or not to show tasks (deleted, done)
###

{React, rclass, rtypes}  = require('../smc-react')

{Icon, Space} = require('../r_misc')

misc = require('smc-util/misc')

exports.ShowToggle = rclass
    propTypes :
        actions : rtypes.object.isRequired
        type    : rtypes.string.isRequired
        show    : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.show != next.show

    render_toggle: ->
        if @props.show
            name = 'check-square-o'
        else
            name = 'square-o'
        return <Icon name={name} />

    toggle_state: ->
        if @props.show
            @props.actions["stop_showing_#{@props.type}"]()
        else
            @props.actions["show_#{@props.type}"]()

    render: ->
        toggle = @render_toggle()
        if not @props.actions?  # no support for toggling (e.g., history view)
            return toggle
        <div onClick={@toggle_state} style={color:'#444', cursor:'pointer'}>
            <span style={fontSize:'17pt'}>
                {toggle}
            </span>
            <Space />
            <span>
                Show {misc.capitalize(@props.type)}
            </span>
        </div>
