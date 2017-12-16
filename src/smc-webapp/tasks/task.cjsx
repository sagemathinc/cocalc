###
A single task
###

{React, rclass, rtypes}  = require('../smc-react')

{MinToggle}           = require('./min-toggle')
{DescriptionRendered} = require('./desc-rendered')
{Changed}             = require('./changed')
{DueDate}             = require('./due')
{DragHandle}          = require('./drag')
{DoneCheckbox}        = require('./done')
{Undelete}            = require('./undelete')

exports.Task = rclass
    propTypes :
        actions    : rtypes.object
        task       : rtypes.immutable.Map.isRequired
        is_current : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.task != next.task or @props.is_current != next.is_current

    render_undelete: ->
        if not @props.task.get('deleted')
            return
        <Undelete onClick={=>@props.actions.undelete_task(@props.task.get('task_id'))} />

    render_drag_handle: ->
        <DragHandle />

    render_done_checkbox: ->
        <DoneCheckbox />

    render_min_toggle: ->
        <MinToggle />

    render_desc: ->
        <div style={padding:'10px'}>
            <DescriptionRendered
                desc = {@props.task.get('desc')}
            />
        </div>

    render_last_edited: ->
        <Changed
            last_edited = {@props.task.get('last_edited')}
            />

    render_due_date: ->
        <DueDate
            due_date = {@props.task.get('due_date')}
            />

    on_click: ->
        @props.actions?.set_current_task(@props.task.get('task_id'))

    render: ->
        style =
            padding : '10px'
            margin  : '10px'
        if @props.is_current
            style.border = '1px solid blue'
        else
            style.border = '1px solid grey'
        if @props.task.get('deleted')
            style.background = 'red'
        <div style={style} onClick={@on_click}>
            {@render_undelete()}
            <br/>
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