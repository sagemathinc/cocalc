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

{React, rclass, rtypes}  = require('../smc-react')

{ButtonGroup, Button} = require('react-bootstrap')

{Icon, Space} = require('../r_misc')


exports.ButtonBar = rclass
    propTypes :
        actions                 : rtypes.object.isRequired
        read_only               : rtypes.bool
        has_unsaved_changes     : rtypes.bool
        current_task_id         : rtypes.string
        current_task_is_deleted : rtypes.bool
        sort_column             : rtypes.string

    shouldComponentUpdate: (next) ->
        return @props.has_unsaved_changes     != next.has_unsaved_changes or \
               @props.current_task_id         != next.current_task_id     or \
               @props.current_task_is_deleted != next.current_task_is_deleted or \
               @props.sort_column             != next.sort_column         or \
               @props.read_only               != next.read_only

    render_task_group: ->
        spacer = <span style={marginLeft:'5px'} />
        <span key='task'>
            <Button
                key      = 'new'
                onClick  = {@props.actions.new_task}
                disabled = {@props.read_only}
                >
                <Icon name='plus-circle' /> New
            </Button>
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
            {spacer}
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

    render_delete_button: ->
        <Button
            key      = 'delete'
            disabled = {not @props.current_task_id  or @props.read_only}
            onClick  = {@props.actions.delete_current_task} >
            <Icon name='trash-o' /> Delete Task
        </Button>

    render_undelete_button: ->
        <Button
            key      = 'delete'
            bsStyle  = 'danger'
            disabled = {not @props.current_task_id  or @props.read_only}
            onClick  = {@props.actions.undelete_current_task} >
            <Icon name='trash-o' /> Undelete Task
        </Button>

    render_delete: ->
        if @props.current_task_is_deleted
            button = @render_undelete_button()
        else
            button = @render_delete_button()
        <div style={float:'right'}>
            {button}
        </div>

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
            </Button>
            <Button
                key     = 'timetravel'
                bsStyle = 'info'
                onClick = {@props.actions.time_travel} >
                <Icon name='history' /> TimeTravel
            </Button>
        </ButtonGroup>

    render: ->
        <div style={padding: '2px 5px'}>
            {@render_task_group()}
            <Space/>
            {@render_help()}
            <Space/>
            {@render_editor_group()}
            <Space/>
            {@render_delete()}
        </div>