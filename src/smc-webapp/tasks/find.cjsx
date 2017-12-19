###
Searching for tasks by full text search and done/deleted status.
###

{React, rclass, rtypes}  = require('../smc-react')

{ShowToggle} = require('./show-toggle')

exports.Find = rclass
    propTypes:
        actions          : rtypes.object
        local_view_state : rtypes.immutable.Map

    render_toggle: (type) ->
        <ShowToggle
            actions = {@props.actions}
            type    = type
            show    = {@props.local_view_state.get("show_#{type}")}
            />

    render: ->
        if not @props.actions? or not @props.local_view_state?
            return <span />
        <div>
            {@render_toggle('done')}
            {@render_toggle('deleted')}
        </div>