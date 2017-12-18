###
List of Tasks
###

{Task} = require('./task')

{React, rclass, rtypes}  = require('../smc-react')

{Headings} = require('./headings')

exports.TaskList = rclass
    propTypes :
        actions          : rtypes.object
        path             : rtypes.string
        project_id       : rtypes.string
        tasks            : rtypes.immutable.Map.isRequired
        visible          : rtypes.immutable.List.isRequired
        current_task_id  : rtypes.string
        local_task_state : rtypes.immutable.Map

    shouldComponentUpdate: (next) ->
        return @props.tasks            != next.tasks or \
               @props.visible          != next.visible or \
               @props.current_task_id  != next.current_task_id or \
               @props.local_task_state != next.local_task_state

    render_task: (task_id) ->
        <Task
            key              = {task_id}
            actions          = {@props.actions}
            path             = {@props.path}
            project_id       = {@props.project_id}
            task             = {@props.tasks.get(task_id)}
            is_current       = {@props.current_task_id == task_id}
            editing_due_date = {@props.local_task_state?.getIn([task_id, 'editing_due_date'])}
            editing_desc     = {@props.local_task_state?.getIn([task_id, 'editing_desc'])}
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