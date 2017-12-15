###
Top-level react component for task list
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

exports.TaskList = rclass ({name}) ->
    propTypes :
        actions : rtypes.object.isRequired

    #reduxProps :
    #    "#{name}" :

    render: ->
        <span>Task list</span>