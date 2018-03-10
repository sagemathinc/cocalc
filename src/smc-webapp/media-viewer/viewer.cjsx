###
The media viewer component -- for viewing various types of media in the frontend.

###

# React libraries
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{webapp_client} = require('../webapp_client')

exports.ImageViewer = rclass
    displayName : "ImageViewer"

    propTypes :
        project_id : rtypes.string
        path       : rtypes.string

    render_image: ->
        url = webapp_client.read_file_from_project({project_id:@props.project_id, path:@props.path})
        <img src={url} />

    render: ->
        # for these file types, this just returns the URL to the file
        <div>
            {@render_buttonbar()}
            {@render_image()}
        </div>