###
Top-level react component for task list
###

{React, rclass, rtypes}  = require('../smc-react')

{TaskList}  = require('./list')

{ButtonBar} = require('./buttonbar')

{Find}      = require('./find')

exports.TaskEditor = rclass ({name}) ->
    propTypes :
        actions : rtypes.object.isRequired

    reduxProps :
        "#{name}" :
            tasks           : rtypes.immutable.Map
            visible         : rtypes.immutable.List
            current_task_id : rtypes.string

    shouldComponentUpdate: (next) ->
        return @props.tasks != next.tasks or @props.visible != next.visible or \
               @props.current_task_id != next.current_task_id

    render_find: ->
        <Find actions={@props.actions} />

    render_button_bar: ->
        <ButtonBar actions={@props.actions} />

    render_list: ->
        if not @props.tasks? or not @props.visible?
            return
        <TaskList
            actions         = {@props.actions}
            tasks           = {@props.tasks}
            visible         = {@props.visible}
            current_task_id = {@props.current_task_id}
        />

    render: ->
        <div style={margin:'15px', border:'1px solid grey'}>
            {@render_find()}
            {@render_button_bar()}
            {@render_list()}
        </div>