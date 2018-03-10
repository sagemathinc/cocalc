###
The media viewer component -- for viewing various types of media in the frontend.

###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{webapp_client} = require('../webapp_client')

{ButtonBar} = require('./button-bar')

exports.ImageViewer = rclass
    displayName : "ImageViewer"

    propTypes :
        project_id : rtypes.string
        path       : rtypes.string

    getInitialState : ->
        param : Math.random()

    render_image: ->
        url = webapp_client.read_file_from_project({project_id:@props.project_id, path:@props.path})
        url += "?param=#{@state.param}"   # force reload whenever refresh button clicked
        <div style={marginTop:'1px', paddingTop:'1px', borderTop:'1px solid lightgray'}>
            <img src={url} style={maxWidth:'100%'} />
        </div>

    render_buttonbar: ->
        <ButtonBar refresh = {=>@setState(param: Math.random())}/>

    render: ->
        # for these file types, this just returns the URL to the file
        <div style={margin:'1px'}>
            {@render_buttonbar()}
            {@render_image()}
        </div>