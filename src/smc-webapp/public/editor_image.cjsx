#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# React libraries
{React, ReactDOM, rclass, rtypes}  = require('../app-framework')
{webapp_client} = require('../webapp_client')

PublicImage = rclass
    displayName : "PublicImage"

    propTypes :
        project_id : rtypes.string
        path       : rtypes.string

    render: ->
        src = webapp_client.project_client.read_file({project_id:@props.project_id, path:@props.path})
        <div className="webapp-editor-static-html-content">
            <img src={src} />
        </div>

require('../project_file').register_file_editor
    ext       : ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'apng', 'svg', 'ico'] # see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img
    is_public : true
    icon      : 'file-image-o'
    component : PublicImage

