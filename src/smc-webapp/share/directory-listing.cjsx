###
This is...
###

misc = require('smc-util/misc')

{rclass, Redux, React, rtypes} = require('../app-framework')

file_editors = require('../file-editors')

{PublicPathInfo} = require('./public-path-info')

exports.DirectoryListing = rclass
    displayName: "DirectoryListing"

    propTypes :
        info    : rtypes.immutable.Map
        files   : rtypes.array.isRequired
        viewer  : rtypes.string.isRequired
        path    : rtypes.string.isRequired
        hidden  : rtypes.bool  # if true, show hidden dot files (will be controlled by a query param)

    render_listing: ->
        i = 0
        for file in @props.files
            if not @props.hidden and file.name[0] == '.'
                continue
            if i % 2 == 0
                style = {background: 'rgb(238, 238, 238)', padding:'5px 10px'}
            else
                style = {padding:'5px 10px'}
            i += 1
            <DirectoryListingEntry
                name   = {file.name}
                size   = {file.size}
                mtime  = {file.mtime}
                isdir  = {!!file.isdir}
                viewer = {@props.viewer}
                path   = {@props.path}
                style  = {style}
                key    = {file.name}
                />

    render: ->
        if @props.viewer == 'embed'
            return <div>{@render_listing()}</div>
        <div style={display: 'flex', flexDirection: 'column'}>
            <PublicPathInfo path={@props.path} info={@props.info} />
            <div style={margin: '15px 30px', background: 'white', overflow:'auto'}>
                {@render_listing()}
            </div>
        </div>

DirectoryListingEntry = rclass
    displayName: "DirectoryListingEntry"

    propTypes :
        name   : rtypes.string.isRequired
        size   : rtypes.number
        mtime  : rtypes.number.isRequired
        isdir  : rtypes.bool.isRequired
        viewer : rtypes.string.isRequired
        path   : rtypes.string.isRequired
        style  : rtypes.object

    get_href: ->
        href = @props.name
        href = misc.encode_path(href)
        if @props.isdir
            href += '/'
        if @props.viewer
            href += "?viewer=#{@props.viewer}"
        return href

    render: ->
        href = @get_href()
        <a href={href} style={fontSize:'14px'}>
            <div style={@props.style} key={@props.name}>
                {@props.name}{if @props.isdir then '/' else ''}
            </div>
        </a>
