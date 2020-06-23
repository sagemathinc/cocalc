#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Task due date
  - displays due date
  - allows for changing it
###

{Button} = require('react-bootstrap')

{React, rclass, rtypes}  = require('../app-framework')

{DateTimePicker, Icon, Space, TimeAgo} = require('../r_misc')

STYLE =
    zIndex       : 1
    position     : 'absolute'
    border       : '1px solid lightgrey'
    background   : 'white'
    borderRadius : '4px'
    margin       : '-20px 0 0 -150px'  # we use a negative margin to adjust absolute position of calendar popover (hackish)
    boxShadow    : '0 6px 12px rgba(0,0,0,.175)'

exports.DueDate = rclass
    propTypes :
        actions   : rtypes.object
        task_id   : rtypes.string.isRequired
        due_date  : rtypes.number
        editing   : rtypes.bool
        read_only : rtypes.bool
        is_done   : rtypes.bool   # do not show due date in red if task already done.

    shouldComponentUpdate: (next) ->
        return @props.due_date  != next.due_date or \
               @props.task_id   != next.task_id  or \
               @props.editing   != next.editing  or \
               @props.read_only != next.read_only or \
               @props.is_done   != next.is_done

    stop_editing: ->
        @props.actions.stop_editing_due_date(@props.task_id)
        @props.actions.enable_key_handler()

    edit: ->
        @props.actions.edit_due_date(@props.task_id)

    set_due_date: (date) ->
        @props.actions.set_due_date(@props.task_id, date)
        if !date
            @stop_editing()

    render_calendar: ->
        if not @props.editing
            return
        if @props.due_date
            value = new Date(@props.due_date)
        else
            value = new Date()
        <div style={STYLE}>
            <DateTimePicker
                value     = {value}
                open      = {true}
                placeholder={"Set Task Due Date"}
                onChange = {(date) => @set_due_date(date - 0)}
                onFocus  = {@props.actions.disable_key_handler}
                onBlur   = {@stop_editing}
            />
        </div>

    render_remove_due_date: ->
        if not @props.due_date
            return
        <span style={color:'#888'}>
            <Space />
            <Icon
                name    = 'times'
                onClick = {=> @set_due_date(null); @props.actions.stop_editing_due_date(@props.task_id)}
            />
        </span>

    render_due_date: ->
        style = undefined
        if @props.due_date
            date = new Date(@props.due_date)
            if date <= new Date() and not @props.is_done
                style = {color:'white', backgroundColor:'red', padding:'3px'}
            elt = <TimeAgo date = {new Date(@props.due_date)}/>
        else
            elt = <span>none</span>
        <span onClick={if not @props.read_only then @edit} style={style} >
            {elt}
        </span>

    render: ->
        if @props.read_only
            return @render_due_date()
        else
            <div style={cursor:'pointer'}>
                {@render_due_date()}
                {@render_remove_due_date()}
                {@render_calendar()}
            </div>
