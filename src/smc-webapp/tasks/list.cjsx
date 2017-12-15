###
List of Tasks
###

{Task} = require('./task')

{React, rclass, rtypes}  = require('../smc-react')

exports.TaskList = rclass
    propTypes :
        tasks   : rtypes.immutable.Map.isRequired
        visible : rtypes.immutable.List.isRequired

    shouldComponentUpdate: (next) ->
        return @props.tasks != next.tasks or @props.visible != next.visible

    render_task: (task_id) ->
        <Task
            key  = {task_id}
            task = {@props.tasks.get(task_id)}
        />

    render_tasks: ->
        x = []
        @props.visible.forEach (task_id) =>
            x.push(@render_task(task_id))
        return x

    render: ->
        <div>
            {@render_tasks()}
        </div>