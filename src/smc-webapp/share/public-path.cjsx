{rclass, React, ReactDOM, rtypes} = require('../smc-react')

exports.PublicPath = rclass
    displayName: "Landing"

    propTypes :
        path : rtypes.immutable.Map.isRequired

    render_view: ->
        path = @props.path.get('path')
        i = path.lastIndexOf('.')
        if i == -1
            return
        ext = path.slice(i+1)
        switch ext
            when 'png', 'jpg', 'gif', 'svg'
                return <img src={@props.path.get('path')} />


    render: ->
        <div>
            Path: <a href={@props.path.get('path')}>{@props.path.get('path')}</a>
            <br/>
            Description: {@props.path.get('description')}
            <br/>
            Project_id: {@props.path.get('project_id')}
            <br/>
            {@render_view()}
        </div>
