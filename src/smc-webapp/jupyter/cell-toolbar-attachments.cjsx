###
The attachment editing toolbar functionality for cells.
###

{Button} = require('react-bootstrap')
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

exports.Attachments = rclass
    propTypes :
        actions : rtypes.object.isRequired
        cell    : rtypes.immutable.Map.isRequired

    edit: ->
        @props.actions.edit_attachments(@props.cell.get('id'))

    render: ->
        <Button
            bsSize  = 'small'
            onClick = {@edit}>
            Delete Attachments...
        </Button>
