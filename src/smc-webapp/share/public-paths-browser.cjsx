###
Share server top-level landing page.
###

{rclass, React, ReactDOM, rtypes} = require('../app-framework')
misc = require('smc-util/misc')
{Space, TimeAgoElement} = require('../r_misc')

INDEX_STYLE =
    margin     : '0px 30px 15px 30px'
    background : 'white'

exports.PublicPathsBrowser = rclass
    displayName: "PublicPathsBrowser"

    propTypes :
        public_paths : rtypes.immutable.Map.isRequired
        paths_order  : rtypes.immutable.List.isRequired
        page_number  : rtypes.number.isRequired
        page_size    : rtypes.number.isRequired

    render_overview: ->
        <span style={color:'#333', paddingRight: '10px', borderRight: '1px solid black', marginRight: '10px'}>
            Page {@props.page_number} of {Math.ceil(@props.public_paths.size / @props.page_size)}.
        </span>

    render_prev_page: ->
        if @props.page_number > 1
            <a href="?page=#{@props.page_number-1}" style={textDecoration:'none'}>Previous</a>
        else
            <span style={color:'#666'}>Previous</span>

    render_next_page: ->
        if @props.page_number*@props.page_size < @props.public_paths.size
            <a href="?page=#{@props.page_number+1}" style={textDecoration:'none'}>Next</a>
        else
            <span style={color:'#666'}>Next</span>

    render_description: (info) ->
        <span key='desc'  style={display:'inline-block', width:'40%'}>
            {info.get('description')}
        </span>

    render_path: (info) ->
        <span key='path'  style={display:'inline-block', width:'30%'}>
            {info.get('path')}
        </span>

    render_last_edited: (info) ->
        last_edited = info.get('last_edited')
        <span key='last'   style={display:'inline-block', width:'30%'}>
            {<TimeAgoElement date={last_edited} live={false} /> if last_edited?}
        </span>

    render_headings: ->
        <div key='headings' style={fontWeight:'bold', padding: '5px', margin: '0px 30px', fontSize: '12pt', color: '#666', borderBottom:'1px solid lightgrey'}>
            <span key='path'  style={display:'inline-block', width:'30%'}>
                Path
            </span>
            <span key='desc' style={display:'inline-block', width:'40%'}>
                Description
            </span>
            <span key='last'   style={display:'inline-block', width:'30%'}>
                Last Edited
            </span>
        </div>

    render_public_path_link: (info, bgcolor) ->
        id         = info.get('id')
        info_path  = misc.encode_path(info.get('path'))

        <div key={id} style={padding: '5px 10px', background:bgcolor}>
            <a href={"#{id}/#{info_path}?viewer=share"} style={display:'inline-block', width:'100%'}>
                {@render_path(info)}
                {@render_description(info)}
                {@render_last_edited(info)}
            </a>
            <br/>
        </div>

    render_index: ->
        j = 0
        for i in [@props.page_size * (@props.page_number - 1)... @props.page_size * @props.page_number]
            id = @props.paths_order.get(i)
            if not id?
                continue
            info = @props.public_paths.get(id)
            if not info? or info.get('auth')  # TODO: as in router.cjsx, we skip all public_paths with auth info for now, until auth is implemented... (?)
                continue
            if info.get('unlisted')
                # Do NOT list unlisted public paths.
                continue
            if j % 2 == 0
                bgcolor = 'rgb(238, 238, 238)'
            else
                bgcolor = undefined
            j += 1
            @render_public_path_link(info, bgcolor)

    render: ->
        <div>
            <div key='top' style={paddingLeft: '30px', background: '#dfdfdf'}>
                {@render_overview()}
                <Space />
                {@render_prev_page()}
                <Space />
                {@render_next_page()}
            </div>
            {@render_headings()}
            <div key='index' style={INDEX_STYLE}>
                {@render_index()}
            </div>
        </div>

