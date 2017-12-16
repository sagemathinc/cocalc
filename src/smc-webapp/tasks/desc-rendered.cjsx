###
Rendered view of the description of a single task
###

{React, rclass, rtypes}  = require('../smc-react')

{Markdown} = require('../r_misc')

exports.DescriptionRendered = rclass
    propTypes :
        desc : rtypes.string

    render: ->
        <Markdown value={@props.desc}/>
