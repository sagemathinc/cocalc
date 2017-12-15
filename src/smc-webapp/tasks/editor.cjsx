###
Top-level react component for task list
###

{React, rclass, rtypes}  = require('../smc-react')

{TaskList} = require('./list')

exports.TaskEditor = rclass ({name}) ->
    propTypes :
        actions : rtypes.object.isRequired

    #reduxProps :
    #    "#{name}" :

    render: ->
        <span>Task list</span>