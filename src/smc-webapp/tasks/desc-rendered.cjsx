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
        minimize   : rtypes.bool

    render_content: ->
        value = @props.desc
        if not value?.trim()
            return <span style={color:'#666'}>Enter a description...</span>
        if @props.minimize
            value = header_part(value)
        <Markdown
            value      = {value}
            project_id = {@props.project_id}
            file_path  = {misc.path_split(@props.path).head}
        />

    render: ->
        <div style={background:'#fff', padding:'0 10px'}>
            {@render_content()}
        </div>


header_part = (s) ->
    lines = s.split('\n')
    for i in [0...lines.length]
        if lines[i].trim() == ''
            if i == lines.length - 1
                return s
            else
                return lines.slice(0,i).join('\n')