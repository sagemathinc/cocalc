###
Image viewer component -- for viewing standard image types.
###

{filename_extension}              = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes} = require('../app-framework')
{webapp_client}                   = require('../webapp_client')

{ButtonBar}                       = require('./button-bar')

{VIDEO_EXTS, IMAGE_EXTS, AUDIO_EXTS} = require('../file-associations')

exports.MediaViewer = rclass
    displayName : "MediaViewer"

    propTypes :
        project_id : rtypes.string
        path       : rtypes.string

    getInitialState : ->
        param : 0   # used to force reload when button explicitly clicked

    get_mode: ->
        ext = filename_extension(@props.path).toLowerCase()
        if ext in VIDEO_EXTS
            return 'video'
        if ext in IMAGE_EXTS
            return 'image'
        if ext in AUDIO_EXTS
            return 'audio'
        console.warn("Unknown media extension #{ext}")
        return ''

    render_media: (url) ->
        switch @get_mode()
            when 'image'
                <img src={url} style={maxWidth:'100%', background:'white'} />
            when 'video'
                <video
                    src      = {url}
                    style    = {maxWidth:'100%'}
                    controls = {true}
                    autoPlay = {true}
                    loop     = {true}
                />
            when 'audio'
                <audio
                    src      = {url}
                    autoPlay = {true}
                    controls = {true}
                    loop     = {false}
                    volume   = {0.5}
                />
            else # should never happen
                <div style={color:'white', fontSize:'200%'}>Unknown type</div>

    render_content: ->
        # the URL to the file:
        url = webapp_client.project_client.read_file({project_id:@props.project_id, path:@props.path})
        if @state.param
            url += "?param=#{@state.param}"   # this forces reload whenever refresh button clicked
        <div style={overflowY:'auto', flex:1, marginTop:'1px', padding:'1px', borderTop:'1px solid lightgray', textAlign:'center', background:'black'}>
            {@render_media(url)}
        </div>

    render_buttonbar: ->
        <ButtonBar refresh = {=>@setState(param: Math.random())}/>

    render: ->
        <div style={marginTop:'1px'} className={'smc-vfill'}>
            {@render_buttonbar()}
            {@render_content()}
        </div>