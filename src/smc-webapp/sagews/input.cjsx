###
Rendering input part of a Sage worksheet cell
###

{rclass, React, rtypes} = require('../smc-react')

exports.CellInput = rclass
    displayName: "SageCell-Input"

    propTypes :
        input  : rtypes.string


    render: ->
        <pre>
            {@props.input}
        </pre>
