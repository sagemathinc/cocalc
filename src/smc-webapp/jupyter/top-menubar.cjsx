###
The Menu bar across the top

File, Edit, etc....
###

{ButtonGroup, Dropdown, MenuItem} = require('react-bootstrap')

{Icon} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{KeyboardShortcut} = require('./keyboard-shortcuts')

misc_page = require('../misc_page')

misc = require('smc-util/misc')
{required, defaults} = misc

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

    focus: ->
        @props.actions.focus(true)

    command: (name) ->
        return => @props.actions?.command(name)

    reduxProps :
        "#{name}" :
            kernels             : rtypes.immutable.List
            kernel              : rtypes.string
            has_unsaved_changes : rtypes.bool
            kernel_info         : rtypes.immutable.Map

    menu_item: (key, name) ->
        if name
            if name[0] == '<'
                return <MenuItem disabled key={key}>{name.slice(1)}</MenuItem>

            if name[0] == '>'
                indent = <span style={marginLeft:'4ex'}/>
                name = name.slice(1)
            else
                indent = ''
            obj = @props.actions._commands?[name]
            if not obj?
                return <MenuItem key={key}>{indent} {name} (not implemented)</MenuItem>

            shortcut = obj.k?[0]
            if shortcut?
                s = <span  className='pull-right'><KeyboardShortcut shortcut={shortcut} /></span>
            else
                s = <span/>

            <MenuItem
                key      = {key}
                onSelect = {@command(name)}
                >
                {indent} {obj.m ? name} {s}
            </MenuItem>
        else
            <MenuItem key={key} divider />

    menu_items: (names) ->
        return (@menu_item(key, name) for key, name of names)

    render_menu: (opts) ->
        {heading, names, opacity} = defaults opts,
            heading : required
            names   : required
            opacity : OPACITY
        <Dropdown key={heading} id={heading}>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                {heading}
            </Dropdown.Toggle>
            <Dropdown.Menu style={opacity:opacity, minWidth: '20em'}>
                {@menu_items(names)}
            </Dropdown.Menu>
        </Dropdown>

    render_file: ->
        @render_menu
            heading : 'File'
            names   : [
                'new notebook', 'open file', '', \
                'duplicate notebook', 'rename notebook', 'save notebook', 'time travel', '', \
                'print preview', '<Download As...', '>download ipynb',  '>download python', '>download html', '>download markdown', '>download rst', '>download pdf', '', \
                'trust notebook', '', \   # will have to be redone
                'close and halt'
            ]

    render_edit: ->
        @render_menu
            heading : 'Edit'
            names   : \
                ["global undo", "global redo", "", \
                 "cut cell", "copy cell", "paste cell above", "paste cell below", "paste cell and replace", "delete cell", "", \
                 "split cell at cursor", "merge cell with previous cell", "merge cell with next cell", "merge cells", "", \
                 "move cell up", "move cell down", "", \
                 "edit notebook metadata", "find and replace"]

    render_view: ->
        @render_menu
            heading : 'View'
            names : \
                ['toggle header', 'toggle toolbar', 'toggle all line numbers', '', \
                 '<Cell Toolbar...', 'cell toolbar none', 'cell toolbar metadata', 'cell toolbar slideshow', '', \
                 'zoom in', 'zoom out']

    render_insert: ->
        <Dropdown key='insert'  id='menu-insert'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                 Insert
            </Dropdown.Toggle>
            <Dropdown.Menu style={opacity:OPACITY}>
                <MenuItem eventKey="insert-cell-above" onSelect={=>@props.actions.insert_cell(-1); @focus()}>Insert Cell Above</MenuItem>
                <MenuItem eventKey="insert-cell-below" onSelect={=>@props.actions.insert_cell(1); @focus()} >Insert Cell Below</MenuItem>
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
                        @focus()
                        } >
                            Run Cells
                </MenuItem>
                <MenuItem eventKey="run-cells-select-below"
                    onSelect = { =>
                        @props.actions.run_selected_cells()
                        @props.actions.move_cursor_after_selected_cells()
                        @props.actions.unselect_all_cells()
                        @focus()
                        } >
                            Run Cells and Select Below
                </MenuItem>
                <MenuItem eventKey="run-cells-insert-below"
                    onSelect = { =>
                        @props.actions.run_selected_cells()
                        @props.actions.move_cursor_to_last_selected_cell()
                        @props.actions.unselect_all_cells()
                        @props.actions.insert_cell(1)
                        @focus()
                        setTimeout((()=>@props.actions.set_mode('edit')),0)
                        } >
                            Run Cells and Insert Below
                </MenuItem>
                <MenuItem eventKey="run-all" onSelect={=>@props.actions.run_all_cells(); @focus()}>Run All</MenuItem>
                <MenuItem eventKey="run-all-below" onSelect={=>@props.actions.run_all_above(); @focus()}>Run All Above</MenuItem>
                <MenuItem eventKey="run-all-below" onSelect={=>@props.actions.run_all_below(); @focus()}>Run All Below</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="" disabled>Cell Type...</MenuItem>
                <MenuItem eventKey="cell-type-code"      onSelect={=>@props.actions.set_selected_cell_type('code'); @focus()} ><span style={marginLeft:'4ex'}/> Code</MenuItem>
                <MenuItem eventKey="cell-type-markdown"  onSelect={=>@props.actions.set_selected_cell_type('markdown'); @focus()} ><span style={marginLeft:'4ex'}/> Markdown</MenuItem>
                <MenuItem eventKey="cell-type-nbconvert" onSelect={=>@props.actions.set_selected_cell_type('nbconvert'); @focus()} ><span style={marginLeft:'4ex'}/> Raw NBConvert</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="" disabled>Current Outputs...</MenuItem>
                <MenuItem eventKey="current-outputs-toggle"   onSelect={=>@props.actions.toggle_selected_outputs('collapsed'); @focus()}  ><span style={marginLeft:'4ex'}/> Toggle</MenuItem>
                <MenuItem eventKey="current-outputs-toggle-scrolling" onSelect={=>@props.actions.toggle_selected_outputs('scrolled')}><span style={marginLeft:'4ex'}/> Toggle Scrolling</MenuItem>
                <MenuItem eventKey="current-outputs-clear"    onSelect={=>@props.actions.clear_selected_outputs(); @focus()} ><span style={marginLeft:'4ex'}/> Clear</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="" disabled>All Output...</MenuItem>
                <MenuItem eventKey="all-outputs-toggle"     onSelect={=>@props.actions.toggle_all_outputs('collapsed'); @focus()}><span style={marginLeft:'4ex'}/> Toggle</MenuItem>
                <MenuItem eventKey="all-outputs-toggle-scrolling" onSelect={=>@props.actions.toggle_all_outputs('scrolled'); @focus()} ><span style={marginLeft:'4ex'}/> Toggle Scrolling</MenuItem>
                <MenuItem eventKey="all-outputs-clear"      onSelect={=>@props.actions.clear_all_outputs(); @focus()}  ><span style={marginLeft:'4ex'}/> Clear</MenuItem>
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
            onSelect = {=>@props.actions.set_kernel(kernel.name); @focus()}
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
                    onSelect = {=>@props.actions.signal('SIGINT'); @focus()}>
                    Interrrupt
                </MenuItem>
                <MenuItem
                    eventKey = "kernel-restart"
                    onSelect = {=>@props.actions.signal('SIGKILL'); @focus()}
                    >
                    Restart...
                </MenuItem>
                <MenuItem
                    eventKey="kernel-restart-clear"
                    onSelect = {@command("confirm restart kernel and clear output")}
                    >
                    Restart & Clear Output...
                </MenuItem>
                <MenuItem
                    eventKey="kernel-run-all"
                    onSelect = {=>@props.actions.signal('SIGKILL'); @props.actions.run_all_cells(); @focus()}
                    >
                    Restart & Run All...
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
        return v

    render_help: ->
        <Dropdown key='help'  id='menu-help'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                Help
            </Dropdown.Toggle>
            <Dropdown.Menu>
                <MenuItem eventKey="help-about" onSelect = {=>@props.actions.show_about()} >About</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="help-ui-tour">User Interface Tour</MenuItem>
                <MenuItem eventKey="help-keyboard" onClick={@command("edit keyboard shortcuts")}>Keyboard Shortcuts</MenuItem>
                <MenuItem divider />
                {external_link('Notebook Help', 'http://nbviewer.jupyter.org/github/ipython/ipython/blob/3.x/examples/Notebook/Index.ipynb')}
                {external_link('Markdown', 'https://help.github.com/articles/basic-writing-and-formatting-syntax')}
                <MenuItem divider />
                {@render_links()}
            </Dropdown.Menu>
        </Dropdown>

    render: ->
        <div style={backgroundColor:'rgb(247,247,247)', border:'1px solid #e7e7e7', height:'34px'}>
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




