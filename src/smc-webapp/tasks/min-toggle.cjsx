###
Toggle to minimize display of a task (just show first part or everything)
###

{React, rclass, rtypes}  = require('../smc-react')

{Icon} = require('../r_misc')


exports.MinToggle = rclass
    propTypes :
        actions  : rtypes.object
        task_id  : rtypes.string
        minimize : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.minimize != next.minimize

    render_toggle: ->
        if @props.minimize
            name = 'caret-right'
        else
            name = 'caret-down'
        return <Icon name={name} style={cursor:'pointer'} />

    toggle_state: ->
        if @props.minimize
            @props.actions.maximize_desc(@props.task_id)
        else
            @props.actions.minimize_desc(@props.task_id)

    render: ->
        toggle = @render_toggle()
        if not @props.actions?  # no support for toggling (e.g., history view)
            return toggle
        <div onClick={@toggle_state} style={fontSize:'17pt', color:'#666'}>
            {toggle}
        </div>
