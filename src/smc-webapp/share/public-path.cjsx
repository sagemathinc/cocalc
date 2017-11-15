###
This is...
###

misc = require('smc-util/misc')

{rclass, React, ReactDOM, rtypes} = require('../smc-react')

exports.PublicPath = rclass
    displayName: "PublicPath"

    propTypes :
        info    : rtypes.immutable.Map.isRequired
        content : rtypes.string

    render_view: ->
        path = @props.info.get('path')
        i = path.lastIndexOf('.')
        if i == -1
            return
        ext = misc.filename_extension(path)
        switch ext
            when 'png', 'jpg', 'gif', 'svg'
                src = "raw/#{@props.info.get('id')}/#{@props.info.get('path')}"
                return <img src={src} />
            when 'md'
                if @props.content?
                    {Markdown} = require('../r_misc')
                    return <Markdown value={@props.content} />


    render: ->
        <div>
            Path: <a href={@props.info.get('path')}>{@props.info.get('path')}</a>
            <br/>
            Description: {@props.info.get('description')}
            <br/>
            Project_id: {@props.info.get('project_id')}
            <br/>
            {@render_view()}
        </div>
