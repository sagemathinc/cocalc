###
Drag tasks handle (and other support)
###

{React, rclass, rtypes}  = require('../smc-react')

{Button} = require('react-bootstrap')

exports.Undelete = rclass
    propTypes :
        onClick : rtypes.func.isRequired

    render: ->
        <Button
            bsStyle = 'danger'
            onClick = {@props.onClick} >
            Undelete
        </Button>
