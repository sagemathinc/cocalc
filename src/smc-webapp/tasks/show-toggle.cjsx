#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Toggle whether or not to show tasks (deleted, done)
###

{React, rclass, rtypes}  = require('../app-framework')

{Icon, Space} = require('../r_misc')

misc = require('smc-util/misc')

exports.ShowToggle = rclass
    propTypes :
        actions : rtypes.object.isRequired
        type    : rtypes.string.isRequired
        count   : rtypes.number.isRequired
        show    : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.show  != next.show or \
               @props.count != next.count or \
               @props.type  != next.type

    render_toggle: ->
        if @props.show
            name = 'check-square-o'
        else
            name = 'square-o'
        return <Icon name={name} />

    toggle_state: ->
        # avoid accidental double clicks...
        now = new Date()
        if now - (@_last_call ? 0) <= 300
            return
        @_last_call = now

        if @props.show
            @props.actions["stop_showing_#{@props.type}"]()
        else
            if @props.count == 0 # do nothing
                return
            @props.actions["show_#{@props.type}"]()

    render: ->
        toggle = @render_toggle()
        if not @props.actions?  # no support for toggling (e.g., history view)
            return toggle
        if @props.count > 0  or @props.show
            color = '#666'
        else
            color = '#999'
        # Debounce is to avoid accidental double clicks.
        <div onClick={@toggle_state} style={color:color}>
            <span style={fontSize:'17pt'}>
                {toggle}
            </span>
            <Space />
            <span>
                Show {@props.type}{### ({@props.count}) ###}
            </span>
        </div>
