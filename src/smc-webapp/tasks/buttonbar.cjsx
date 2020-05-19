#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

###
Button bar:

 - New        : make a new task
 - Up         : move task to the top of displayed tasks
 - Down       : move task to the bottom...
 - Delete     : delete a task

 - Save       : Save task list to disk
 - TimeTravel : Show edit history
 - Help       : Show help about the task editor (link to github wiki)
###

{React, rclass, rtypes} = require('../app-framework')
{ButtonGroup, Button}   = require('react-bootstrap')
{Icon, Space, UncommittedChanges} = require('../r_misc')

exports.ButtonBar = rclass
    propTypes :
        actions                 : rtypes.object.isRequired
        read_only               : rtypes.bool
        has_unsaved_changes     : rtypes.bool
        has_uncommitted_changes : rtypes.bool
        current_task_id         : rtypes.string
        current_task_is_deleted : rtypes.bool
        sort_column             : rtypes.string

    shouldComponentUpdate: (next) ->
        return @props.has_unsaved_changes     != next.has_unsaved_changes or \
               @props.has_uncommitted_changes != next.has_uncommitted_changes or \
               @props.current_task_id         != next.current_task_id     or \
               @props.current_task_is_deleted != next.current_task_is_deleted or \
               @props.sort_column             != next.sort_column         or \
               @props.read_only               != next.read_only

    render_top_button: ->  # not using this -- not sure it is a good/useful idea...
        <ButtonGroup>
            <Button
                key      = 'up'
                onClick  = {@props.actions.move_task_to_top}
                disabled = {@props.sort_column != 'Custom Order' or @props.read_only}
                >
                <Icon name='hand-o-up' /> Top
            </Button>
            <Button
                key      = 'down'
                onClick  = {@props.actions.move_task_to_bottom}
                disabled = {@props.sort_column != 'Custom Order' or @props.read_only}
                >
                <Icon name='hand-o-down' /> Bottom
            </Button>
        </ButtonGroup>

    render_task_group: ->
        spacer = <span style={marginLeft:'5px'} />
        <span key='task'>
            <ButtonGroup>
                <Button
                    key      = 'new'
                    onClick  = {@props.actions.new_task}
                    disabled = {@props.read_only}
                    >
                    <Icon name='plus-circle' /> New
                </Button>
                {@render_delete()}
            </ButtonGroup>
            {spacer}
            <ButtonGroup>
                <Button
                    key      = 'undo'
                    onClick  = {@props.actions.undo}
                    disabled = {@props.read_only}
                    >
                    <Icon name='undo' /> Undo
                </Button>
                <Button
                    key      = 'redo'
                    onClick  = {@props.actions.redo}
                    disabled = {@props.read_only}
                    >
                    <Icon name='repeat' /> Redo
                </Button>
            </ButtonGroup>
            {spacer}
            {### @render_top_buttom() ###}
            {### spacer ###}
            <ButtonGroup>
                <Button
                    key     = 'font-increase'
                    onClick = {@props.actions.decrease_font_size}
                    >
                    <Icon style   = {fontSize:'7pt'} name='font' />
                </Button>
                <Button
                    key     = 'font-decrease'
                    onClick = {@props.actions.increase_font_size}
                    >
                    <Icon style   = {fontSize:'11pt'} name='font' />
                </Button>
            </ButtonGroup>
        </span>

    render_undelete_button: ->
        <Button
            key      = 'delete'
            disabled = {not @props.current_task_id  or @props.read_only}
            onClick  = {@props.actions.undelete_current_task} >
            <Icon name='trash-o' /> Undelete Task
        </Button>

    render_delete: ->
        if @props.current_task_is_deleted
            return @render_undelete_button()
        else
            return @render_delete_button()

    render_delete_button: ->
        <Button
            key      = 'delete'
            disabled = {not @props.current_task_id  or @props.read_only}
            onClick  = {@props.actions.delete_current_task} >
            <Icon name='trash-o' /> Delete
        </Button>


    render_help: ->
        <Button
            key     = 'help'
            bsStyle = 'info'
            onClick = {@props.actions.help} >
            <Icon name='question-circle' /> Help
        </Button>

    render_editor_group: ->
        <ButtonGroup key='editor'>
            <Button
                key      = 'save'
                bsStyle  = 'success'
                disabled = {not @props.has_unsaved_changes or @props.read_only}
                onClick  = {@props.actions.save} >
                <Icon name='save' /> {if @props.read_only then 'Readonly' else 'Save'}
                <UncommittedChanges has_uncommitted_changes={@props.has_uncommitted_changes} />
            </Button>
            <Button
                key     = 'timetravel'
                bsStyle = 'info'
                onClick = {@props.actions.time_travel} >
                <Icon name='history' /> TimeTravel
            </Button>
        </ButtonGroup>

    render: ->
        # the zIndex 1 and background white is so that when the description
        # of what is visible in the previous line flows around (for skinny display),
        # it is hidden.
        <div style={padding: '0px 5px 5px', zIndex:1, background:'white'}>
            {@render_task_group()}
            <Space/>
            {@render_help()}
            <Space/>
            {@render_editor_group()}
        </div>