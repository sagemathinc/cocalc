# React libraries
{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('../smc-react')
{salvus_client} = require('../salvus_client')

PublicPDF = rclass
    displayName : "PublicPDF"

    propTypes :
        project_id : rtypes.string
        path       : rtypes.string

    render : ->
        src = salvus_client.read_file_from_project({project_id:@props.project_id, path:@props.path})
        <div className="salvus-editor-public-content" style={overflowY: 'hidden', flex:1, display:'flex'}>
            <iframe src={src} style={width:'100%'} />
        </div>

require('../project_file').register_file_editor
    ext       : 'pdf'
    is_public : true
    icon      : 'file-pdf-o'
    component : PublicPDF

