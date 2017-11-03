###
"Editor" (really a read-only simple viewer) for generic data files

See https://github.com/sagemathinc/cocalc/issues/2462
###

# React libraries
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{webapp_client} = require('../webapp_client')

DataGeneric = rclass
    displayName : "DataGeneric"

    propTypes :
        project_id : rtypes.string
        path       : rtypes.string

    render: ->
        src = webapp_client.read_file_from_project({project_id:@props.project_id, path:@props.path})
        <div style={margin:'15px'}>
            <h2>Data File</h2>
            CoCalc does not have a viewer or editor for <a href={src} target="_blank">{@props.path}</a>.
            <br/><br/>
            You may be able to use this file from another program, for example, as a data file that is manipulated using a Jupyter notebook.
        </div>

require('../project_file').register_file_editor
    ext       : ['fit']
    icon      : 'table'
    component : DataGeneric
