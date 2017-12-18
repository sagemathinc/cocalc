###
Rendered view of the description of a single task
###

{React, rclass, rtypes}  = require('../smc-react')

{Markdown} = require('../r_misc')

misc = require('smc-util/misc')

exports.DescriptionRendered = rclass
    propTypes :
        desc       : rtypes.string
        path       : rtypes.string
        project_id : rtypes.string

    render: ->
        <Markdown
            value      = {@props.desc}
            project_id = {@props.project_id}
            file_path  = {misc.path_split(@props.path).head}
        />
