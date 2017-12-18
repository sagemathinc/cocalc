###
Edit description of a single task
###

{React, rclass, rtypes}  = require('../smc-react')

exports.DescriptionEditor = rclass
    propTypes :
        actions  : rtypes.object
        task_id  : rtypes.string.isRequired
        desc     : rtypes.string

    shouldComponentUpdate: (next) ->
        return @props.desc     != next.desc or \
               @props.task_id  != next.task_id

    render: ->
        <div>DescriptionEditor -- {@props.desc}</div>