###
Button bar:

 - New        : make a new task
 - Up         : move task to the top of displayed tasks
 - Down       : move task to the bottom...
 - Delete     : delete a task
 - Help       : Show help about the task editor (link to github wiki)
 - Save       : Save task list to disk
 - TimeTravel : Show edit history
###

{React, rclass, rtypes}  = require('../smc-react')

exports.DueDate = rclass
    render: ->
        <span>Due date<span>