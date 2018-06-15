###
The metadata editing toolbar.
###

{Button} = require('react-bootstrap')
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

exports.Metadata = rclass
    propTypes :
        actions : rtypes.object.isRequired
        cell    : rtypes.immutable.Map.isRequired

    edit: ->
        @props.actions.edit_cell_metadata(@props.cell.get('id'))

    render: ->
        <Button
            bsSize  = 'small'
            onClick = {@edit}>
            Edit Custom Metadata...
        </Button>
