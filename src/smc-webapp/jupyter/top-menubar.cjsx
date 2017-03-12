###
The Menu bar across the top

File, Edit, etc....
###

{ButtonGroup, DropdownButton, MenuItem} = require('react-bootstrap')

{Icon} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

exports.TopMenubar = rclass
    shouldComponentUpdate: ->
        # the menus are currently static -- if we change that... change this.
        return false

    propTypes :
        actions : rtypes.object.isRequired

    render_file: ->
        <DropdownButton noCaret bsStyle='default' title='File' key='file' id='menu-file' style={border:0, backgroundColor: 'rgb(247,247,247)'}>
            <MenuItem eventKey="new">New Notebook...</MenuItem>
            <MenuItem eventKey="open">Open...</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="copy">Make a Copy...</MenuItem>
            <MenuItem eventKey="rename">Rename...</MenuItem>
            <MenuItem eventKey="save">Save</MenuItem>
            <MenuItem eventKey="timetravel">Publish...</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="timetravel">TimeTravel...</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="print">Print Preview</MenuItem>
            <MenuItem eventKey="download" disabled>Download As...</MenuItem>
            <MenuItem eventKey="download-ipynb"   ><span style={marginLeft:'4ex'}/> Notebook (.ipynb)</MenuItem>
            <MenuItem eventKey="download-python"  ><span style={marginLeft:'4ex'}/> Python (.py)</MenuItem>
            <MenuItem eventKey="download-html"    ><span style={marginLeft:'4ex'}/> HTML (.html)</MenuItem>
            <MenuItem eventKey="download-markdown"><span style={marginLeft:'4ex'}/> Markdown (.md)</MenuItem>
            <MenuItem eventKey="download-rst"     ><span style={marginLeft:'4ex'}/> reST (.rst)</MenuItem>
            <MenuItem eventKey="download-pdf"     ><span style={marginLeft:'4ex'}/> PDF via LaTeX (.pdf)</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="trusted" disabled={true}>Trusted Notebook</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="close">Close and Halt</MenuItem>
        </DropdownButton>

    render_edit: ->
        <DropdownButton noCaret bsStyle='default' title='Edit' key='edit'  id='menu-edit'  style={border:0, backgroundColor: 'rgb(247,247,247)'}>
            <MenuItem eventKey="cut-cells"  onSelect={=>@props.actions.undo()}>Undo</MenuItem>
            <MenuItem eventKey="copy-cells" onSelect={=>@props.actions.redo()}>Redo</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="cut-cells">Cut Cells</MenuItem>
            <MenuItem eventKey="copy-cells">Copy Cells</MenuItem>
            <MenuItem eventKey="paste-cells-above">Paste Cells Above</MenuItem>
            <MenuItem eventKey="paste-cells-below">Paste Cells Below</MenuItem>
            <MenuItem eventKey="paste-cells-and-replace">Paste Cells & Replace</MenuItem>
            <MenuItem eventKey="delete-cells"      onSelect={=>@props.actions.delete_selected_cells()}>Delete Cells</MenuItem>
            <MenuItem eventKey="undo-delete-cells" onSelect={=>@props.actions.undo()}>Undo Delete Cells</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="split-cell" onSelect={=>@props.actions.split_current_cell()}>Split Cell</MenuItem>
            <MenuItem eventKey="merge-cell-above">Merge Cell Above</MenuItem>
            <MenuItem eventKey="merge-cell-below">Merge Cell Below</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="move-cell-up" onSelect={=>@props.actions.move_selected_cells(-1)}>Move Cell Up</MenuItem>
            <MenuItem eventKey="move-cell-down"  onSelect={=>@props.actions.move_selected_cells(1)}>Move Cell Down</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="edit-notebook-metadata">Edit Notebook Metadata</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="find-and-replace">Find and Replace</MenuItem>
        </DropdownButton>

    render_view: ->
        <DropdownButton noCaret bsStyle='default' title='View' key='view'  id='menu-view'  style={border:0, backgroundColor: 'rgb(247,247,247)'}>
            <MenuItem eventKey="toggle-header">Toggle Header</MenuItem>
            <MenuItem eventKey="toggle-toolbar">Toggle Toolbar</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="" disabled>Cell Toolbar...</MenuItem>
            <MenuItem eventKey="cell-toolbar-none"     ><span style={marginLeft:'4ex'}/> None</MenuItem>
            <MenuItem eventKey="cell-toolbar-metadata" ><span style={marginLeft:'4ex'}/> Edit Metadata</MenuItem>
            <MenuItem eventKey="cell-toolbar-raw"      ><span style={marginLeft:'4ex'}/> Raw Cell Format</MenuItem>
            <MenuItem eventKey="cell-toolbar-slideshow"><span style={marginLeft:'4ex'}/> Slideshow</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="view-zoom-in">Zoom In</MenuItem>
            <MenuItem eventKey="view-zoom-out">Zoom Out</MenuItem>
        </DropdownButton>

    render_insert: ->
        <DropdownButton noCaret bsStyle='default' title='Insert' key='insert'  id='menu-insert'  style={border:0, backgroundColor: 'rgb(247,247,247)'}>
            <MenuItem eventKey="insert-cell-above" onSelect={=>@props.actions.insert_cell(-1)}>Insert Cell Above</MenuItem>
            <MenuItem eventKey="insert-cell-below" onSelect={=>@props.actions.insert_cell(1)} >Insert Cell Below</MenuItem>
        </DropdownButton>

    render_cell: ->
        <DropdownButton noCaret bsStyle='default' title='Cell' key='cell'  id='menu-cell'  style={border:0, backgroundColor: 'rgb(247,247,247)'}>
            <MenuItem eventKey="run-cells" onSelect={=>@props.actions.run_selected_cells()}>Run Cells</MenuItem>
            <MenuItem eventKey="run-cells-select-below">Run Cells and Select Below</MenuItem>
            <MenuItem eventKey="run-cells-insert-below">Run Cells and Insert Below</MenuItem>
            <MenuItem eventKey="run-all" onSelect={=>@props.actions.run_all_cells()}>Run All</MenuItem>
            <MenuItem eventKey="run-all-below">Run All Above</MenuItem>
            <MenuItem eventKey="run-all-below">Run All Below</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="" disabled>Cell Type...</MenuItem>
            <MenuItem eventKey="cell-type-code"      onSelect={=>@props.actions.set_selected_cell_type('code')} ><span style={marginLeft:'4ex'}/> Code</MenuItem>
            <MenuItem eventKey="cell-type-markdown"  onSelect={=>@props.actions.set_selected_cell_type('markdown')} ><span style={marginLeft:'4ex'}/> Markdown</MenuItem>
            <MenuItem eventKey="cell-type-nbconvert" onSelect={=>@props.actions.set_selected_cell_type('nbconvert')} ><span style={marginLeft:'4ex'}/> Raw NBConvert</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="" disabled>Current Outputs...</MenuItem>
            <MenuItem eventKey="current-outputs-toggle"     ><span style={marginLeft:'4ex'}/> Toggle</MenuItem>
            <MenuItem eventKey="current-outputs-toggle-scrolling" ><span style={marginLeft:'4ex'}/> Toggle Scrolling</MenuItem>
            <MenuItem eventKey="current-outputs-clear"      ><span style={marginLeft:'4ex'}/> Clear</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="" disabled>All Output...</MenuItem>
            <MenuItem eventKey="all-outputs-toggle"     ><span style={marginLeft:'4ex'}/> Toggle</MenuItem>
            <MenuItem eventKey="all-outputs-toggle-scrolling" ><span style={marginLeft:'4ex'}/> Toggle Scrolling</MenuItem>
            <MenuItem eventKey="all-outputs-clear"      ><span style={marginLeft:'4ex'}/> Clear</MenuItem>
        </DropdownButton>

    # obviously TODO regarding kernel selection
    render_kernel: ->
        <DropdownButton noCaret bsStyle='default' title='Kernel' key='kernel'  id='menu-kernel'  style={border:0, backgroundColor: 'rgb(247,247,247)'}>
            <MenuItem eventKey="kernel-interrupt">Inerrrupt</MenuItem>
            <MenuItem eventKey="kernel-restart">Restart</MenuItem>
            <MenuItem eventKey="kernel-restart-clear">Restart & Clear Output</MenuItem>
            <MenuItem eventKey="kernel-run-all">Restart & Run All</MenuItem>
            <MenuItem eventKey="kernel-reconnect">Reconnect</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="" disabled>Change kernel...</MenuItem>
            <MenuItem eventKey="kernel-change-anaconda"     ><span style={marginLeft:'4ex'}/> Anaconda (Python 3)</MenuItem>
            <MenuItem eventKey="kernel-change-python2sage" ><span style={marginLeft:'4ex'}/> Python 2 (SageMath</MenuItem>
            <MenuItem eventKey="kernel-change-anaconda"     ><span style={marginLeft:'4ex'}/> Anaconda (Python 3)</MenuItem>
            <MenuItem eventKey="kernel-change-python2sage" ><span style={marginLeft:'4ex'}/> Python 2 (SageMath</MenuItem>
            <MenuItem eventKey="kernel-change-anaconda"     ><span style={marginLeft:'4ex'}/> Anaconda (Python 3)</MenuItem>
            <MenuItem eventKey="kernel-change-python2sage" ><span style={marginLeft:'4ex'}/> Python 2 (SageMath</MenuItem>
            <MenuItem eventKey="kernel-change-anaconda"     ><span style={marginLeft:'4ex'}/> Anaconda (Python 3)</MenuItem>
            <MenuItem eventKey="kernel-change-python2sage" ><span style={marginLeft:'4ex'}/> Python 2 (SageMath</MenuItem>
            <MenuItem eventKey="kernel-change-anaconda"     ><span style={marginLeft:'4ex'}/> Anaconda (Python 3)</MenuItem>
            <MenuItem eventKey="kernel-change-python2sage" ><span style={marginLeft:'4ex'}/> Python 2 (SageMath</MenuItem>
            <MenuItem eventKey="kernel-change-anaconda"     ><span style={marginLeft:'4ex'}/> Anaconda (Python 3)</MenuItem>
            <MenuItem eventKey="kernel-change-python2sage" ><span style={marginLeft:'4ex'}/> Python 2 (SageMath</MenuItem>
            <MenuItem eventKey="kernel-change-anaconda"     ><span style={marginLeft:'4ex'}/> Anaconda (Python 3)</MenuItem>
            <MenuItem eventKey="kernel-change-python2sage" ><span style={marginLeft:'4ex'}/> Python 2 (SageMath</MenuItem>
        </DropdownButton>

    render_widgets: ->
        <DropdownButton noCaret bsStyle='default' title='Widgets' key='widgets'  id='menu-widgets'  style={border:0, backgroundColor: 'rgb(247,247,247)'}>
            <MenuItem eventKey="widgets-save-with-snapshots">Save notebook with snapshots</MenuItem>
            <MenuItem eventKey="widgets-download">Download widget state</MenuItem>
            <MenuItem eventKey="widgets-embed">Embed widgets</MenuItem>
        </DropdownButton>

    render_help: ->
        <DropdownButton noCaret bsStyle='default' title='Help' key='help'  id='menu-help'  style={border:0, backgroundColor: 'rgb(247,247,247)'}>
            <MenuItem eventKey="help-ui-tour">User Interface Tour</MenuItem>
            <MenuItem eventKey="help-keyboard">Keyboard Shortcuts</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="help-notebook-help"><Icon name='external-link'/> Notebook Help</MenuItem>
            <MenuItem eventKey="help-markdown"><Icon name='external-link'/> Markdown</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="help-python"><Icon name='external-link'/> Python</MenuItem>
            <MenuItem eventKey="help-ipython"><Icon name='external-link'/> IPython</MenuItem>
            <MenuItem eventKey="help-numpy"><Icon name='external-link'/> NumPy</MenuItem>
            <MenuItem eventKey="help-scipy"><Icon name='external-link'/> SciPy</MenuItem>
            <MenuItem eventKey="help-matplotlib"><Icon name='external-link'/> Matplotlib</MenuItem>
            <MenuItem eventKey="help-sympy"><Icon name='external-link'/> SymPy</MenuItem>
            <MenuItem eventKey="help-pandas"><Icon name='external-link'/> Pandas</MenuItem>
            <MenuItem eventKey="help-sagemath"><Icon name='external-link'/> SageMath</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="help-about">About</MenuItem>
        </DropdownButton>

    render: ->
        <div style={padding: '5px', backgroundColor:'rgb(247,247,247)', border:'1px solid #e7e7e7'}>
            <ButtonGroup>
                {@render_file()}
                {@render_edit()}
                {@render_view()}
                {@render_insert()}
                {@render_cell()}
                {@render_kernel()}
                {@render_widgets()}
                {@render_help()}
            </ButtonGroup>
        </div>