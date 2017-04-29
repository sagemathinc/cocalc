###
The tag editing toolbar functionality for cells.
###

{Button} = require('react-bootstrap')
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

exports.TagsToolbar = rclass
    propTypes :
        actions : rtypes.object.isRequired
        cell    : rtypes.immutable.Map.isRequired

    render: ->
        <Button
            bsSize  = 'small'>
            Add Tag
        </Button>
