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
        actions : rtypes.object.isRequired

    render_task_group: ->
        <ButtonGroup key='task'>
            <Button
                key     = 'new'
                onClick = {@props.actions.new_task} >
                <Icon name='plus-circle' /> New
            </Button>
            <Button
                key     = 'up'
                onClick = {@props.actions.move_task_to_top} >
                <Icon name='hand-o-up' /> Top
            </Button>
            <Button
                key     = 'down'
                onClick = {@props.actions.move_task_to_bottom} >
                <Icon name='hand-o-down' /> Bottom
            </Button>
            <Button
                key     = 'delete'
                bsStyle = 'danger'
                onClick = {@props.actions.delete_task} >
                <Icon name='trash-o' /> Delete
            </Button>
        </ButtonGroup>

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
                key     = 'save'
                bsStyle = 'success'
                onClick = {@props.actions.save} >
                <Icon name='save' /> Save
            </Button>
            <Button
                key     = 'timetravel'
                bsStyle = 'info'
                onClick = {@props.actions.time_travel} >
                <Icon name='history' /> TimeTravel
            </Button>
        </ButtonGroup>

    render: ->
        <div>
            {@render_task_group()}
            <Space/>
            {@render_help()}
            <Space/>
            {@render_editor_group()}
        </div>