###
The format bar
###

{React, rclass, rtypes} = require('../smc-react')

exports.FormatBar = rclass
    propTypes :
        actions : rtypes.object.isRequired

    render: ->
        <div>Format bar</div>