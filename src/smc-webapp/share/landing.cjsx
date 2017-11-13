###
Share server top-level landing page.
###

{rclass, React, ReactDOM, rtypes} = require('../smc-react')

exports.Landing = rclass
    displayName: "Landing"

    propTypes :
        public_paths : rtypes.immutable.Map.isRequired
        page_number  : rtypes.number.isRequired
        page_size    : rtypes.number.isRequired

    render_overview: ->
        <div>
            There are {@props.public_paths.size} projects with public paths.
        </div>

    render_prev_page: ->
        if @props.page_number > 0
            <a href="?page=#{@props.page_number-1}">Previous</a>

    render_next_page: ->
        if (@props.page_number+1)*@props.page_size < @props.public_paths.size
            <a href="?page=#{@props.page_number+1}">Next</a>

    render_project_link: (project_id) ->
        <div key={project_id}> {project_id} </div>

    render_project_index: ->
        project_ids = @props.public_paths.keySeq().toJS()
        project_ids.sort()
        for i in [@props.page_size * @props.page_number ... @props.page_size * (@props.page_number + 1)]
            if project_ids[i]
                @render_project_link(project_ids[i])

    render: ->
        <html>
            <head>
                <title>CoCalc public shared files</title>
            </head>
            <body>
                <h1>CoCalc public shared files</h1>
                {@render_overview()}
                <br/>
                {@render_prev_page()}
                <br/>
                {@render_next_page()}

                <hr/>

                {@render_project_index()}
            </body>
        </html>