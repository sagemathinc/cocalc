###
"Editor" (really a read-only simple viewer) for generic data files

See https://github.com/sagemathinc/cocalc/issues/2462
###

# React libraries
{Well} = require('react-bootstrap')
{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{webapp_client} = require('../webapp_client')
{Markdown}      = require('../r_misc')
misc            = require('smc-util/misc')

excel_info = 'Microsoft Excel file -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Calc" application.'
hdf_file = 'Hierarchical Data Format (HDF file) -- you can open this file using a Python or R library.'
microsoft_word = 'Microsoft Word file -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Writer" application.'
microsoft_ppt = 'Microsoft PowerPoint -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Impress" application.'

# ext: markdown string.
INFO =
    h4   : hdf_file
    h5   : hdf_file
    xlsx : excel_info
    xls  : excel_info
    doc  : microsoft_word
    docx : microsoft_word
    ppt  : microsoft_ppt
    pptx : microsoft_ppt
    raw  : 'You may be able to use this file via a Python library or use it in some other way.'
    tiff : 'You may be able to use this file via a Python image manipulation library or use it in some other way.'
    fit  : 'You may be able to use this file from Python using the [fitparse](https://github.com/dtcooper/python-fitparse) library.'
    odt  : 'OpenDocument Text -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Writer" application.'
    ods  : 'OpenDocument Spreadsheet -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Calc" application.'
    odp  : 'OpenDocument Presentation -- Create an ["X11" file](https://doc.cocalc.com/x11.html) and open the "Impress" application.'
    sobj : 'You can load an sobj file into **SageMath** by typing `load("filename.sobj")`.'
    'noext-octave-workspace' : '''
                               This is a data file that contains the state of your Octave workspace.
                               Read more: [Saving-Data-on-Unexpected-Exits](https://www.gnu.org/software/octave/doc/v4.2.1/Saving-Data-on-Unexpected-Exits.html).
                               '''
    'noext-a.out' : 'This is a binary executable, which you can run in a Terminal by typing ./a.out.'

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
            <span style={color:'#666'}>
                You may be able to use this file from another program, for example, as
                a data file that is manipulated using a Jupyter notebook.
            </span>

    render: ->
        src = webapp_client.read_file_from_project({project_id:@props.project_id, path:@props.path})
        <Well style={margin:'15px', fontSize:'12pt'}>
            <h2>Data File</h2>
            CoCalc does not have a special viewer or editor for <a href={src} target="_blank">{@props.path}</a>.
            <br/><br/>
            {@render_hint()}
        </Well>

require('../project_file').register_file_editor
    ext       : misc.keys(INFO)
    icon      : 'question-circle'
    component : DataGeneric
