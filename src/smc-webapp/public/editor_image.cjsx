# React libraries
{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('../smc-react')
{salvus_client} = require('../salvus_client')

PublicImage = rclass
    displayName : "PublicImage"

    propTypes :
        project_id : rtypes.string
        path       : rtypes.string

    render: ->
        src = salvus_client.read_file_from_project({project_id:@props.project_id, path:@props.path})
        <div className="salvus-editor-static-html-content">
            <img src={src} />
        </div>

require('../project_file').register_file_editor
    ext       : ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'apng', 'svg', 'ico'] # see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img
    is_public : true
    icon      : 'file-image-o'
    component : PublicImage

