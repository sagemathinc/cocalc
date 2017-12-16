###
List of Tasks
###

{Task} = require('./task')

{React, rclass, rtypes}  = require('../smc-react')

{Headings} = require('./headings')

exports.TaskList = rclass
    propTypes :
        actions         : rtypes.object
        tasks           : rtypes.immutable.Map.isRequired
        visible         : rtypes.immutable.List.isRequired
        current_task_id : rtypes.string

    shouldComponentUpdate: (next) ->
        return @props.tasks != next.tasks or @props.visible != next.visible or \
               @props.current_task_id != next.current_task_id

    render_task: (task_id) ->
        <Task
            key        = {task_id}
            actions    = {@props.actions}
            task       = {@props.tasks.get(task_id)}
            is_current = {@props.current_task_id == task_id}
        />

    render_headings: ->
        <Headings />

    render_tasks: ->
        x = []
        @props.visible.forEach (task_id) =>
            x.push(@render_task(task_id))
        return x

    render: ->
        <div>
            {@render_headings()}
            {@render_tasks()}
        </div>