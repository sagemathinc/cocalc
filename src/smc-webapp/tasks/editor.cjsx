###
Top-level react component for task list
###

{React, rclass, rtypes}  = require('../smc-react')

{TaskList} = require('./list')

exports.TaskEditor = rclass ({name}) ->
    propTypes :
        actions : rtypes.object.isRequired

    reduxProps :
        "#{name}" :
            tasks   : rtypes.immutable.Map
            visible : rtypes.immutable.List

    shouldComponentUpdate: (next) ->
        return @props.tasks != next.tasks or @props.visible != next.visible

    render_list: ->
        if not @props.tasks? or not @props.visible?
            return
        <TaskList
            tasks   = {@props.tasks}
            visible = {@props.visible}
        />

    render: ->
        <div>
            <h1>Task List</h1>
            {@render_list()}
        </div>