###
A single task
###

{React, rclass, rtypes}  = require('../smc-react')

{MinToggle}    = require('./min-toggle')
{Description}  = require('./desc')
{Changed}      = require('./changed')
{DueDate}      = require('./due')
{DragHandle}   = require('./drag')
{DoneCheckbox} = require('./done')

exports.Task = rclass
    propTypes :
        actions          : rtypes.object
        path             : rtypes.string
        project_id       : rtypes.string
        task             : rtypes.immutable.Map.isRequired
        is_current       : rtypes.bool
        editing_due_date : rtypes.bool
        editing_desc     : rtypes.bool
        min_desc         : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.task              != next.task             or \
               @props.is_current        != next.is_current       or \
               @props.editing_due_date  != next.editing_due_date or \
               @props.editing_desc      != next.editing_desc     or \
               @props.min_desc          != next.min_desc

    render_drag_handle: ->
        <DragHandle />

    render_done_checkbox: ->  # cast of done to bool for backward compat
        <DoneCheckbox
            actions = {@props.actions}
            done    = {!!@props.task.get('done')}
            task_id = {@props.task.get('task_id')}
        />

    render_min_toggle: ->
        <MinToggle
            actions  = {@props.actions}
            task_id  = {@props.task.get('task_id')}
            minimize = {@props.min_desc}
        />

    render_desc: ->
        <Description
            actions    = {@props.actions}
            path       = {@props.path}
            project_id = {@props.project_id}
            task_id    = {@props.task.get('task_id')}
            desc       = {@props.task.get('desc')}
            editing    = {@props.editing_desc}
            minimize   = {@props.min_desc}
            is_current = {@props.is_current}
        />

    render_last_edited: ->
        <Changed
            last_edited = {@props.task.get('last_edited')}
            />

    render_due_date: ->
        <DueDate
            actions  = {@props.actions}
            task_id  = {@props.task.get('task_id')}
            due_date = {@props.task.get('due_date')}
            editing  = {@props.editing_due_date}
            />

    on_click: ->
        @props.actions?.set_current_task(@props.task.get('task_id'))

    render: ->
        style =
            padding : '10px'
            margin  : '10px'
        if @props.is_current
            style.border       = '2px solid #08c'
            style.borderRadius = '5px'
            style.background   = "rgb(232, 242, 255)"
        else
            style.border = '2px solid lightgrey'
        if @props.task.get('deleted')
            style.background = '#d9534f'
            style.color      = '#eee'
        else if @props.task.get('done')
            style.color = '#888'
        <div style={style} onClick={@on_click}>
            {@render_drag_handle()}
            <br/>
            {@render_done_checkbox()}
            <br/>
            {@render_min_toggle()}
            <br/>
            {@render_desc()}
            <br/>
            {@render_due_date()}
            <br/>
            {@render_last_edited()}
        </div>