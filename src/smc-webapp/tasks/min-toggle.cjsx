#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Toggle to minimize display of a task (just show first part or everything)
###

{React, rclass, rtypes}  = require('../app-framework')

{Icon, Tip} = require('../r_misc')

exports.MinToggle = rclass
    propTypes :
        actions   : rtypes.object
        task_id   : rtypes.string
        full_desc : rtypes.bool
        has_body  : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.full_desc != next.full_desc or @props.has_body != next.has_body

    render_toggle: ->
        if not @props.has_body
            return <Icon name={'caret-right'} />
        if @props.full_desc
            name = 'caret-down'
        else
            name = 'caret-right'
        return <Icon name={name} />

    toggle_state: ->
        @props.actions.toggle_full_desc(@props.task_id)

    render: ->
        if not @props.actions?  # no support for toggling (e.g., history view)
            return <span/>
        toggle = @render_toggle()
        if @props.has_body
            <span onClick={@toggle_state} style={fontSize:'17pt', color:'#888', float:'right'}>
                {toggle}
            </span>
        else
            <span />