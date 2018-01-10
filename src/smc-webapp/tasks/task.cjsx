###
A single task
###

{React, rclass, rtypes}  = require('../smc-react')

{Row, Col} = require('react-bootstrap')


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
        font_size        : rtypes.number
        sortable         : rtypes.bool
        read_only        : rtypes.bool

    shouldComponentUpdate: (next) ->
        return @props.task              != next.task             or \
               @props.is_current        != next.is_current       or \
               @props.editing_due_date  != next.editing_due_date or \
               @props.editing_desc      != next.editing_desc     or \
               @props.min_desc          != next.min_desc         or \
               @props.font_size         != next.font_size        or \
               @props.sortable          != next.sortable         or \
               @props.read_only         != next.read_only

    render_drag_handle: ->
        <DragHandle sortable={@props.sortable}/>

    render_done_checkbox: ->  # cast of done to bool for backward compat
        <DoneCheckbox
            actions   = {@props.actions}
            read_only = {@props.read_only}
            done      = {!!@props.task.get('done')}
            task_id   = {@props.task.get('task_id')}
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
            font_size  = {@props.font_size}
            read_only  = {@props.read_only}
        />

    render_last_edited: ->
        <span style={fontSize: '10pt', color: '#666'}>
            <Changed
                last_edited = {@props.task.get('last_edited')}
                />
        </span>

    render_due_date: ->
        <span style={fontSize: '10pt', color: '#666'}>
            <DueDate
                actions   = {@props.actions}
                read_only = {@props.read_only}
                task_id   = {@props.task.get('task_id')}
                due_date  = {@props.task.get('due_date')}
                editing   = {@props.editing_due_date}
                />
        </span>

    on_click: ->
        @props.actions?.set_current_task(@props.task.get('task_id'))

    render: ->
        style =
            padding      : '5px 5px 0 5px'
            margin       : '5px'
            borderRadius : '4px'
            background   : 'white'
        if @props.is_current
            style.border       = '2px solid #08c'
        else
            style.border = '2px solid lightgrey'
        if @props.task.get('deleted')
            style.background = '#d9534f'
            style.color  = '#fff'
        else if @props.task.get('done')
            style.color = '#888'
        if @props.font_size?
            style.fontSize = "#{@props.font_size}px"
        <div style={style} onClick={@on_click}>
            <Row>
                <Col md={1} style={display: 'flex', flexDirection:'row'}>
                    {@render_drag_handle()}
                    {@render_done_checkbox()}
                    {@render_min_toggle()}
                </Col>
                <Col md={9}>
                    {@render_desc()}
                </Col>
                <Col md={1}>
                    {@render_due_date()}
                </Col>
                <Col md={1}>
                    {@render_last_edited()}
                </Col>
            </Row>
        </div>