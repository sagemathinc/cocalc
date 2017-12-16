###
Task due date
  - displays due date
  - allows for changing it
###

{React, rclass, rtypes}  = require('../smc-react')

{TimeAgo} = require('../r_misc')

exports.DueDate = rclass
    propTypes :
        due_date : rtypes.number

    shouldComponentUpdate: (next) ->
        return @props.due_date != next.due_date

    render: ->
        if @props.due_date
            <TimeAgo date = {new Date(@props.due_date)} />
        else
            <span>none</span>