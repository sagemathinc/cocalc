###
"Editor" (really a read-only simple viewer) for generic data files

See https://github.com/sagemathinc/cocalc/issues/2462
###

# React libraries
{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{webapp_client} = require('../webapp_client')
{Markdown}      = require('../r_misc')
misc            = require('smc-util/misc')

# ext: markdown string.
INFO =
    fit  : 'You may be able to use this file from Python using the [fitparse](https://github.com/dtcooper/python-fitparse) library.'
    odt  : 'Please download this file to your computer and open it using [OpenOffice Writer](https://www.openoffice.org/product/writer.html).'
    sobj : 'You can load an sobj file into **SageMath** by typing `load("filename.sobj")`.'

DataGeneric = rclass
    displayName : "DataGeneric"

    propTypes :
        project_id : rtypes.string
        path       : rtypes.string

    render_hint: ->
        ext = misc.filename_extension(@props.path)
        hint = INFO[ext]
        if hint
            <Markdown value={hint} />
        else
            <span>
                You may be able to use this file from another program, for example, as
                a data file that is manipulated using a Jupyter notebook.
            </span>

    render: ->
        src = webapp_client.read_file_from_project({project_id:@props.project_id, path:@props.path})
        <div style={margin:'15px', fontSize:'12pt'}>
            <h2>Data File</h2>
            CoCalc does not have a viewer or editor for <a href={src} target="_blank">{@props.path}</a>.
            <br/><br/>
            {@render_hint()}
        </div>

require('../project_file').register_file_editor
    ext       : misc.keys(INFO)
    icon      : 'table'
    component : DataGeneric
