###
Headings of the task list:

  - Custom order
  - Due
  - Changed
###

{React, rclass, rtypes}  = require('../smc-react')

exports.Headings = rclass
    render: ->
        <div style={border:'1px solid lightgrey'}>
            Custom Order | Due | Changed
        </div>