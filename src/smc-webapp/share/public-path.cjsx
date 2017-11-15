###
This is...
###

misc = require('smc-util/misc')

{rclass, React, ReactDOM, rtypes} = require('../smc-react')

r_misc = require('../r_misc')

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
        ext = misc.filename_extension(path)?.toLowerCase()
        switch ext
            when 'png', 'jpg', 'gif', 'svg'
                src = @props.info.get('path')
                return <img src={src} />
            when 'md'
                if @props.content?
                    return <r_misc.Markdown value={@props.content} />
            when 'html', 'htm'
                if @props.content?
                    return <r_misc.HTML value={@props.content} />
            else
                if @props.content?
                    return <pre>{@props.content}</pre>


    render: ->
        <div>
            <div>
                <a href="..">Up</a>
                <br/>
                Raw File: <a href={@props.info.get('path')}>{@props.info.get('path')}</a>
                <br/>
                Description: {@props.info.get('description')}
                <br/>
                Project_id: {@props.info.get('project_id')}
            </div>
            <br/>
            <div style={border: '1px solid grey', padding: '10px', background: 'white'}>
                {@render_view()}
            </div>
        </div>
