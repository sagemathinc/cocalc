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

exports.Task = rclass
    propTypes :
        task : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (next) ->
        return @props.task != next.task

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

    render: ->
        <div style={border:'1px solid grey'}>
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