###
Toggle to minimize display of a task (just show first part or everything)
###

{React, rclass, rtypes}  = require('../smc-react')

{Icon, Tip} = require('../r_misc')

exports.MinToggle = rclass
    propTypes :
        actions  : rtypes.object
        task_id  : rtypes.string
        minimize : rtypes.bool
        has_body : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.minimize != next.minimize or @props.has_body != next.has_body

    render_toggle: ->
        if not @props.has_body
            return <Icon name={'caret-right'} />
        if @props.minimize
            name = 'caret-right'
        else
            name = 'caret-down'
        return <Icon name={name} />

    toggle_state: ->
        if @props.minimize
            @props.actions.maximize_desc(@props.task_id)
        else
            @props.actions.minimize_desc(@props.task_id)

    render: ->
        if not @props.actions?  # no support for toggling (e.g., history view)
            return <span/>
        toggle = @render_toggle()
        if @props.has_body
            if @props.minimize
                title = 'Show full description'
            else
                title = 'Show only up to first blank line'
            <Tip title={title} delayShow={1000}>
                <div onClick={@toggle_state} style={fontSize:'17pt', color:'#888'}>
                    {toggle}
                </div>
            </Tip>
        else
            <span />