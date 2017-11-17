###
Share server top-level landing page.
###

{rclass, React, ReactDOM, rtypes} = require('../smc-react')

{Space} = require('../r_misc')

INDEX_STYLE =
    margin     : '5px'
    overflow   : 'auto'
    height     : '100%'
    border     : '1px solid black'
    padding    : '15px'
    background : 'white'

exports.PublicPathsBrowser = rclass
    displayName: "PublicPathsBrowser"

    propTypes :
        public_paths : rtypes.immutable.Map.isRequired
        page_number  : rtypes.number.isRequired
        page_size    : rtypes.number.isRequired

    render_overview: ->
        <div>
            Page {@props.page_number+1} of {Math.ceil(@props.public_paths.size / @props.page_size)}.
        </div>

    render_prev_page: ->
        if @props.page_number > 0
            <a href="?page=#{@props.page_number-1}">Previous</a>

    render_next_page: ->
        if (@props.page_number+1)*@props.page_size < @props.public_paths.size
            <a href="?page=#{@props.page_number+1}">Next</a>

    render_public_path_link: (id) ->
        info = @props.public_paths.get(id)
        if not info?
            return
        <div key={id}>
            <a href={"#{id}/#{info.get('path')}?viewer=share"}> {info.get('description')} [{info.get('path')}]</a>
            <br/>
        </div>

    render_index: ->
        ids = @props.public_paths.keySeq().toJS()
        ids.sort()
        for i in [@props.page_size * @props.page_number ... @props.page_size * (@props.page_number + 1)]
            if ids[i]
                @render_public_path_link(ids[i])

    render: ->
        <div style={display:'flex', flexDirection:'column'}>
            <div key='top'>
                {@render_overview()}
                <Space />
                {@render_prev_page()}
                <Space />
                {@render_next_page()}
            </div>

            <div key='index' style={INDEX_STYLE}>
                {@render_index()}
            </div>
        </div>

