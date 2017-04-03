###
The Menu bar across the top

File, Edit, etc....
###

{ButtonGroup, Dropdown, MenuItem} = require('react-bootstrap')

{Icon} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

misc_page = require('../misc_page')

OPACITY='.9'

TITLE_STYLE =
    color           : '#666'
    border          : 0
    backgroundColor : 'rgb(247,247,247)'

exports.TopMenubar = rclass ({name}) ->
    shouldComponentUpdate: (next) ->
        return next.has_unsaved_changes != @props.has_unsaved_changes or \
            next.kernels != @props.kernels or \
            next.kernel != @props.kernel

    propTypes :
        actions : rtypes.object.isRequired

    reduxProps :
        "#{name}" :
            kernels             : rtypes.immutable.List
            kernel              : rtypes.string
            has_unsaved_changes : rtypes.bool
            kernel_info         : rtypes.immutable.Map

    render_file: ->
        <Dropdown key='file' id='menu-file'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                File
            </Dropdown.Toggle>
            <Dropdown.Menu >
                <MenuItem eventKey="new">New Notebook...</MenuItem>
                <MenuItem eventKey="open"   onSelect={=>@props.actions.file_open()} >Open...</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="copy">Make a Copy...</MenuItem>
                <MenuItem eventKey="rename">Rename...</MenuItem>
                <MenuItem
                    eventKey = "save"
                    onSelect = {=>@props.actions.save()}
                    disabled = {not @props.has_unsaved_changes} >
                    Save
                </MenuItem>
                <MenuItem eventKey="timetravel">Publish...</MenuItem>
                <MenuItem divider />
                <MenuItem
                    eventKey="timetravel"
                    onSelect={=>@props.actions.show_history_viewer()}>
                        TimeTravel...
                </MenuItem>
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
            </Dropdown.Menu>
        </Dropdown>

    render_edit: ->
        <Dropdown key='edit' id='menu-edit'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                Edit
            </Dropdown.Toggle>
            <Dropdown.Menu style={opacity:OPACITY}>
                <MenuItem eventKey="cut-cells"               onSelect={=>@props.actions.undo()}                 >Undo</MenuItem>
                <MenuItem eventKey="copy-cells"              onSelect={=>@props.actions.redo()}                 >Redo</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="cut-cells"               onSelect={=>@props.actions.cut_selected_cells()}   >Cut Cells</MenuItem>
                <MenuItem eventKey="copy-cells"              onSelect={=>@props.actions.copy_selected_cells()}  >Copy Cells</MenuItem>
                <MenuItem eventKey="paste-cells-above"       onSelect={=>@props.actions.paste_cells(-1)}        >Paste Cells Above</MenuItem>
                <MenuItem eventKey="paste-cells-below"       onSelect={=>@props.actions.paste_cells(1)}         >Paste Cells Below</MenuItem>
                <MenuItem eventKey="paste-cells-and-replace" onSelect={=>@props.actions.paste_cells(0)}         >Paste Cells & Replace</MenuItem>
                <MenuItem eventKey="delete-cells"            onSelect={=>@props.actions.delete_selected_cells()}>Delete Cells</MenuItem>
                <MenuItem eventKey="undo-delete-cells"       onSelect={=>@props.actions.undo()}                 >Undo Delete Cells</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="split-cell"              onSelect={=>@props.actions.split_current_cell()}   >Split Cell</MenuItem>
                <MenuItem eventKey="merge-cell-above"        onSelect={=>@props.actions.merge_cell_above()}     >Merge Cell Above</MenuItem>
                <MenuItem eventKey="merge-cell-below"        onSelect={=>@props.actions.merge_cell_below()}     >Merge Cell Below</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="move-cell-up"            onSelect={=>@props.actions.move_selected_cells(-1)}>Move Cell Up</MenuItem>
                <MenuItem eventKey="move-cell-down"          onSelect={=>@props.actions.move_selected_cells(1)} >Move Cell Down</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="edit-notebook-metadata">Edit Notebook Metadata</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="find-and-replace">Find and Replace</MenuItem>
            </Dropdown.Menu>
        </Dropdown>

    render_view: ->
        <Dropdown key='view'  id='menu-view'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                View
            </Dropdown.Toggle>
            <Dropdown.Menu style={opacity:OPACITY}>
                <MenuItem eventKey="toggle-header"  onSelect={=>@props.actions.toggle_header()}>Toggle Header</MenuItem>
                <MenuItem eventKey="toggle-toolbar" onSelect={=>@props.actions.toggle_toolbar()}>Toggle Toolbar</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="" disabled>Cell Toolbar...</MenuItem>
                <MenuItem eventKey="cell-toolbar-none"     ><span style={marginLeft:'4ex'}/> None</MenuItem>
                <MenuItem eventKey="cell-toolbar-metadata" ><span style={marginLeft:'4ex'}/> Edit Metadata</MenuItem>
                <MenuItem eventKey="cell-toolbar-slideshow"><span style={marginLeft:'4ex'}/> Slideshow</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="view-zoom-in"  onSelect={=>@props.actions.zoom(1)}>Zoom In</MenuItem>
                <MenuItem eventKey="view-zoom-out" onSelect={=>@props.actions.zoom(-1)}>Zoom Out</MenuItem>
            </Dropdown.Menu>
        </Dropdown>

    render_insert: ->
        <Dropdown key='insert'  id='menu-insert'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                 Insert
            </Dropdown.Toggle>
            <Dropdown.Menu style={opacity:OPACITY}>
                <MenuItem eventKey="insert-cell-above" onSelect={=>@props.actions.insert_cell(-1)}>Insert Cell Above</MenuItem>
                <MenuItem eventKey="insert-cell-below" onSelect={=>@props.actions.insert_cell(1)} >Insert Cell Below</MenuItem>
            </Dropdown.Menu>
        </Dropdown>

    render_cell: ->
        <Dropdown key='cell'  id='menu-cell'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                Cell
            </Dropdown.Toggle>
            <Dropdown.Menu style={opacity:OPACITY}>
                <MenuItem
                    eventKey = "run-cells"
                    onSelect = { =>
                        @props.actions.run_selected_cells()
                        @props.actions.move_cursor_to_last_selected_cell()
                        @props.actions.unselect_all_cells()
                        } >
                            Run Cells
                </MenuItem>
                <MenuItem eventKey="run-cells-select-below"
                    onSelect = { =>
                        @props.actions.run_selected_cells()
                        @props.actions.move_cursor_after_selected_cells()
                        @props.actions.unselect_all_cells()
                        } >
                            Run Cells and Select Below
                </MenuItem>
                <MenuItem eventKey="run-cells-insert-below"
                    onSelect = { =>
                        @props.actions.run_selected_cells()
                        @props.actions.move_cursor_to_last_selected_cell()
                        @props.actions.unselect_all_cells()
                        @props.actions.insert_cell(1)
                        setTimeout((()=>@props.actions.set_mode('edit')),0)
                        } >
                            Run Cells and Insert Below
                </MenuItem>
                <MenuItem eventKey="run-all" onSelect={=>@props.actions.run_all_cells()}>Run All</MenuItem>
                <MenuItem eventKey="run-all-below" onSelect={=>@props.actions.run_all_above()}>Run All Above</MenuItem>
                <MenuItem eventKey="run-all-below" onSelect={=>@props.actions.run_all_below()}>Run All Below</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="" disabled>Cell Type...</MenuItem>
                <MenuItem eventKey="cell-type-code"      onSelect={=>@props.actions.set_selected_cell_type('code')} ><span style={marginLeft:'4ex'}/> Code</MenuItem>
                <MenuItem eventKey="cell-type-markdown"  onSelect={=>@props.actions.set_selected_cell_type('markdown')} ><span style={marginLeft:'4ex'}/> Markdown</MenuItem>
                <MenuItem eventKey="cell-type-nbconvert" onSelect={=>@props.actions.set_selected_cell_type('nbconvert')} ><span style={marginLeft:'4ex'}/> Raw NBConvert</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="" disabled>Current Outputs...</MenuItem>
                <MenuItem eventKey="current-outputs-toggle"   onSelect={=>@props.actions.toggle_selected_outputs('collapsed')}  ><span style={marginLeft:'4ex'}/> Toggle</MenuItem>
                <MenuItem eventKey="current-outputs-toggle-scrolling" onSelect={=>@props.actions.toggle_selected_outputs('scrolled')}><span style={marginLeft:'4ex'}/> Toggle Scrolling</MenuItem>
                <MenuItem eventKey="current-outputs-clear"    onSelect={=>@props.actions.clear_selected_outputs()} ><span style={marginLeft:'4ex'}/> Clear</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="" disabled>All Output...</MenuItem>
                <MenuItem eventKey="all-outputs-toggle"     onSelect={=>@props.actions.toggle_all_outputs('collapsed')}><span style={marginLeft:'4ex'}/> Toggle</MenuItem>
                <MenuItem eventKey="all-outputs-toggle-scrolling" onSelect={=>@props.actions.toggle_all_outputs('scrolled')} ><span style={marginLeft:'4ex'}/> Toggle Scrolling</MenuItem>
                <MenuItem eventKey="all-outputs-clear"      onSelect={=>@props.actions.clear_all_outputs()}  ><span style={marginLeft:'4ex'}/> Clear</MenuItem>
            </Dropdown.Menu>
        </Dropdown>

    # TODO: upper case kernel names, descriptions... and make it a new component for efficiency so don't re-render if not change
    render_kernel_item: (kernel) ->
        style = {marginLeft:'4ex'}
        if kernel.name == @props.kernel
            style.color = '#2196F3'
            style.fontWeight = 'bold'
        <MenuItem
            key      = {kernel.name}
            eventKey = "kernel-change-#{kernel.name}"
            onSelect = {=>@props.actions.set_kernel(kernel.name)}
            >
            <span style={style}> {kernel.display_name} </span>
        </MenuItem>

    render_kernel_items: ->
        if not @props.kernels?
            return
        else
            for kernel in @props.kernels.toJS()
                @render_kernel_item(kernel)

    render_kernel: ->
        <Dropdown key='kernel'  id='menu-kernel'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                Kernel
            </Dropdown.Toggle>
            <Dropdown.Menu>
                <MenuItem
                    eventKey = "kernel-interrupt"
                    onSelect = {=>@props.actions.signal('SIGINT')}>
                    Interrrupt
                </MenuItem>
                <MenuItem
                    eventKey = "kernel-restart"
                    onSelect = {=>@props.actions.signal('SIGKILL')}
                    >
                    Restart
                </MenuItem>
                <MenuItem
                    eventKey="kernel-restart-clear"
                    onSelect = {=>@props.actions.signal('SIGKILL'); @props.actions.clear_all_outputs()}
                    >
                    Restart & Clear Output
                </MenuItem>
                <MenuItem
                    eventKey="kernel-run-all"
                    onSelect = {=>@props.actions.signal('SIGKILL'); @props.actions.run_all_cells()}
                    >
                    Restart & Run All
                </MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="" disabled>Change kernel...</MenuItem>
                {@render_kernel_items()}
            </Dropdown.Menu>
        </Dropdown>

    render_widgets: -> # TODO: not supported in v1
        <Dropdown key='widgets' id='menu-widgets'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                 Widgets
            </Dropdown.Toggle>
            <Dropdown.Menu style={opacity:OPACITY}>
                <MenuItem eventKey="widgets-save-with-snapshots">Save notebook with snapshots</MenuItem>
                <MenuItem eventKey="widgets-download">Download widget state</MenuItem>
                <MenuItem eventKey="widgets-embed">Embed widgets</MenuItem>
            </Dropdown.Menu>
        </Dropdown>

    links_python: ->
        'Python'     : 'https://docs.python.org/2.7/'
        'IPython'    : 'http://ipython.org/documentation.html'
        'Numpy'      : 'https://docs.scipy.org/doc/numpy/reference/'
        'SciPy'      : 'https://docs.scipy.org/doc/scipy/reference/'
        'Matplotlib' : 'http://matplotlib.org/contents.html'
        'Sympy'      : 'http://docs.sympy.org/latest/index.html'
        'Pandas'     : 'http://pandas.pydata.org/pandas-docs/stable/'
        'SageMath'   : 'http://doc.sagemath.org/'

    links_r: ->
        'R'                : 'https://www.r-project.org/'
        'R Jupyter Kernel' : 'https://irkernel.github.io/faq/'
        'Bioconductor'     : 'https://www.bioconductor.org/'
        'ggplot2'          : 'http://ggplot2.org/'

    links_bash: ->
        'Bash'     : 'https://tiswww.case.edu/php/chet/bash/bashtop.html'
        'Tutorial' : 'http://ryanstutorials.net/linuxtutorial/'

    links_julia: ->
        'Julia Documentation' : 'http://docs.julialang.org/en/stable/'
        'Gadly Plotting'      : 'http://gadflyjl.org/stable/'

    links_octave: ->
        'Octave'               : 'https://www.gnu.org/software/octave/'
        'Octave Documentation' : 'https://www.gnu.org/software/octave/doc/interpreter/'
        'Octave Tutorial'      : 'https://en.wikibooks.org/wiki/Octave_Programming_Tutorial'
        'Octave FAQ'           : 'http://wiki.octave.org/FAQ'

    links_postgresql: ->
        'PostgreSQL'                : 'https://www.postgresql.org/docs/'
        'PostgreSQL Jupyter Kernel' : 'https://github.com/bgschiller/postgres_kernel'

    links_scala211: ->
        'Scala Documentation' : 'https://www.scala-lang.org/documentation/'

    links_singular: ->
        'Singular Manual' : 'http://www.singular.uni-kl.de/Manual/latest/index.htm'

    render_links: ->
        v = []
        lang = @props.kernel_info?.get('language')
        f = @["links_#{lang}"]
        if f?
            for name, url of f()
                v.push(external_link(name, url))
            v.push <MenuItem key='sep' divider />
        return v

    render_help: ->
        <Dropdown key='help'  id='menu-help'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                Help
            </Dropdown.Toggle>
            <Dropdown.Menu>
                <MenuItem eventKey="help-ui-tour">User Interface Tour</MenuItem>
                <MenuItem eventKey="help-keyboard">Keyboard Shortcuts</MenuItem>
                <MenuItem divider />
                {external_link('Notebook Help', 'http://nbviewer.jupyter.org/github/ipython/ipython/blob/3.x/examples/Notebook/Index.ipynb')}
                {external_link('Markdown', 'https://help.github.com/articles/basic-writing-and-formatting-syntax')}
                <MenuItem divider />
                {@render_links()}

                <MenuItem eventKey="help-about">About</MenuItem>
            </Dropdown.Menu>
        </Dropdown>

    render: ->
        <div style={backgroundColor:'rgb(247,247,247)', border:'1px solid #e7e7e7', height:'32px'}>
            <ButtonGroup>
                {@render_file()}
                {@render_edit()}
                {@render_view()}
                {@render_insert()}
                {@render_cell()}
                {@render_kernel()}
                {# @render_widgets()}
                {@render_help()}
            </ButtonGroup>
        </div>

external_link = (name, url) ->
    <MenuItem
        key = {name}
        onSelect = {=>misc_page.open_new_tab(url)}
        >
        <Icon name='external-link'/> {name}
    </MenuItem>




