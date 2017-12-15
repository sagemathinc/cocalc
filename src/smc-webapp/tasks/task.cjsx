###
A single task
###

{React, rclass, rtypes}  = require('../smc-react')

exports.Task = rclass
    propTypes :
        task : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (next) ->
        return @props.task != next.task

    render: ->
        <div>
            {@props.task.get('desc')}

            {@props.task.get('last_edited')}

            {@props.task.get('due_date')}
        </div>