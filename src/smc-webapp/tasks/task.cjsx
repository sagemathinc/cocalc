#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
A single task
###

{React, rclass, rtypes}  = require('../app-framework')

{Grid, Row, Col} = require('react-bootstrap')


{MinToggle}    = require('./min-toggle')
{Description}  = require('./desc')
{Changed}      = require('./changed')
{DueDate}      = require('./due')
{DragHandle}   = require('./drag')
{DoneCheckbox} = require('../frame-editors/task-editor/done')
{Timer}        = require('./timer')
{header_part}  = require('./desc-rendering')

exports.Task = rclass
    propTypes :
        actions          : rtypes.object
        path             : rtypes.string
        project_id       : rtypes.string
        task             : rtypes.immutable.Map.isRequired
        is_current       : rtypes.bool
        editing_due_date : rtypes.bool
        editing_desc     : rtypes.bool
        full_desc        : rtypes.bool
        font_size        : rtypes.number
        sortable         : rtypes.bool
        read_only        : rtypes.bool
        selected_hashtags: rtypes.immutable.Map
        search_terms     : rtypes.immutable.Set

    shouldComponentUpdate: (next) ->
        return @props.task              != next.task             or \
               @props.is_current        != next.is_current       or \
               @props.editing_due_date  != next.editing_due_date or \
               @props.editing_desc      != next.editing_desc     or \
               @props.full_desc         != next.full_desc        or \
               @props.font_size         != next.font_size        or \
               @props.sortable          != next.sortable         or \
               @props.read_only         != next.read_only        or \
               @props.selected_hashtags != next.selected_hashtags or \
               @props.search_terms      != next.search_terms

    render_drag_handle: ->
        <DragHandle sortable={@props.sortable}/>

    render_done_checkbox: ->  # cast of done to bool for backward compat
        <DoneCheckbox
            actions   = {@props.actions}
            read_only = {@props.read_only}
            done      = {!!@props.task.get('done')}
            task_id   = {@props.task.get('task_id')}
        />

    render_timer: ->
        <Timer
            actions = {@props.actions}
            task_id = {@props.task.get('task_id')}
        />

    render_min_toggle: (has_body) ->
        <MinToggle
            actions   = {@props.actions}
            task_id   = {@props.task.get('task_id')}
            full_desc = {@props.full_desc}
            has_body  = {has_body}
        />

    render_desc: ->
        <Description
            actions           = {@props.actions}
            path              = {@props.path}
            project_id        = {@props.project_id}
            task_id           = {@props.task.get('task_id')}
            desc              = {@props.task.get('desc')}
            full_desc         = {@props.full_desc}
            editing           = {@props.editing_desc}
            is_current        = {@props.is_current}
            font_size         = {@props.font_size}
            read_only         = {@props.read_only}
            selected_hashtags = {@props.selected_hashtags}
            search_terms      = {@props.search_terms}
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
                is_done   = {!!@props.task.get('done')}
                />
        </span>

    on_click: ->
        @props.actions?.set_current_task(@props.task.get('task_id'))

    render: ->
        style =
            margin       : '2px 5px'
            background   : 'white'
        if @props.is_current
            style.border       = '1px solid rgb(171, 171, 171)'
            style.borderLeft   = '5px solid rgb(66, 165, 245)'
            style.background   = 'rgb(247, 247, 247)'
        else
            style.border       = '1px solid #ccc'
            style.borderLeft   = '5px solid #ccc'
        if @props.task.get('deleted')
            style.background = '#d9534f'
            style.color  = '#fff'
        else if @props.task.get('done')
            style.color = '#888'
        if @props.font_size?
            style.fontSize = "#{@props.font_size}px"

        desc = @props.task.get('desc') ? ''
        if @props.editing_desc
            # while editing no min toggle
            min_toggle = false
        else
            # not editing, so maybe a min toggle...
            min_toggle = header_part(desc) != desc.trim()

        <Grid style={style} onClick={@on_click} fluid={true}>
            <Row>
                <Col sm={1}>
                    {@render_drag_handle()}
                    {@render_min_toggle(min_toggle)}
                </Col>
                <Col sm={8}>
                    {@render_desc()}
                </Col>
                <Col sm={1}>
                    {@render_due_date()}
                </Col>
                <Col sm={1}>
                    {@render_last_edited()}
                </Col>
                <Col sm={1}>
                    {@render_done_checkbox()}
                </Col>
            </Row>
        </Grid>
