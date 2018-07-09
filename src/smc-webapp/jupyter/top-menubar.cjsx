###
The Menu bar across the top

File, Edit, etc....
###

{ButtonGroup, Dropdown, MenuItem} = require('react-bootstrap')

{Icon} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{KeyboardShortcut} = require('./keyboard-shortcuts')

misc_page = require('../misc_page')

misc = require('smc-util/misc')
{required, defaults} = misc

OPACITY='.9'

TITLE_STYLE =
    color           : '#666'
    border          : 0
    backgroundColor : 'rgb(247,247,247)'

SELECTED_STYLE =
    color      : '#2196F3'
    fontWeight : 'bold'

exports.TopMenubar = rclass ({name}) ->
    reduxProps :
        "#{name}" :
            kernels             : rtypes.immutable.List
            kernel              : rtypes.string
            kernel_state        : rtypes.string
            has_unsaved_changes : rtypes.bool
            kernel_info         : rtypes.immutable.Map
            backend_kernel_info : rtypes.immutable.Map
            cells               : rtypes.immutable.Map
            cur_id              : rtypes.string
            trust               : rtypes.bool
            view_mode           : rtypes.string
            toolbar             : rtypes.bool
            cell_toolbar        : rtypes.string
            read_only           : rtypes.bool
        "page" :
            fullscreen          : rtypes.string

    shouldComponentUpdate: (next) ->
        return next.has_unsaved_changes != @props.has_unsaved_changes or \
            next.read_only != @props.read_only or \
            next.kernels != @props.kernels or \
            next.kernel != @props.kernel or \
            next.kernel_state != @props.kernel_state or \
            next.backend_kernel_info != @props.backend_kernel_info or \
            next.cur_id != @props.cur_id or \
            next.cells != @props.cells or \
            next.trust != @props.trust or \
            next.toolbar != @props.toolbar or \
            next.cell_toolbar != @props.cell_toolbar or \
            next.view_mode != @props.view_mode

    propTypes :
        actions : rtypes.object.isRequired

    render_file: ->
        ext = @props.backend_kernel_info?.getIn(['language_info', 'file_extension'])
        if ext?
            m = misc.capitalize(@props.backend_kernel_info.getIn(['language_info', 'name']))
            script_entry = {name:'>nbconvert script', display:"#{m} (#{ext})..."}
        else
            script_entry = '>nbconvert script'

        if @props.trust
            trust = {name:"<trust notebook", display:"Trusted notebook"}
        else
            trust = {name:"trust notebook", display:"Trust notebook..."}

        save = 'save notebook'
        if not @props.has_unsaved_changes or @props.read_only
            save = '<' + save

        rename = 'rename notebook'
        if @props.has_unsaved_changes or @props.read_only
            rename = '<' + rename

        close_and_halt = 'close and halt'
        if @props.read_only
            close_and_halt = '<' + close_and_halt

        names = [
                'new notebook', 'open file', close_and_halt, '', \
                'duplicate notebook', rename, save, 'time travel', '', \
                'print preview', 'nbconvert slides', \
                '<Download as...', '>nbconvert ipynb',  script_entry, '>nbconvert html', '>nbconvert markdown', '>nbconvert rst', '>nbconvert tex', '>nbconvert pdf',  '>nbconvert sagews', '>nbconvert asciidoc', '', \
                trust]
        if @props.fullscreen != 'kiosk'
            names.push('')
            names.push('switch to classical notebook')

        @render_menu
            heading : 'File'
            names   : names

    render_edit: ->
        cell_type = @props.cells?.get(@props.cur_id)?.get('cell_type')
        @render_menu
            heading  : 'Edit'
            disabled : @props.read_only
            names    : \
                ["global undo", "global redo", "", \
                 "cut cell", "copy cell", "paste cell above", "paste cell below", "paste cell and replace", "delete cell", "", \
                 "split cell at cursor", "merge cell with previous cell", "merge cell with next cell", "merge cells", "", \
                 "move cell up", "move cell down", "", \
                 "write protect", "delete protect", "", \
                 "find and replace", "", \
                 "#{if cell_type != 'markdown' then '<' else ''}insert image"]  # disable if not markdown

    render_view: ->
        shownb =
            normal : '>view notebook normal'
            raw    : '>view notebook raw'
            json   : '>view notebook json'

        shownb[@props.view_mode] = {name:shownb[@props.view_mode], style:SELECTED_STYLE}

        toolbar = {name:'toggle toolbar', display:if @props.toolbar then 'Hide Toolbar' else 'Show Toolbar'}

        cell_toolbars = []
        for name in ['none', 'metadata', 'slideshow', 'attachments', 'tags']
            item_name = ">cell toolbar #{name}"
            if (@props.cell_toolbar ? 'none') == name
                cell_toolbars.push({name:item_name, style:SELECTED_STYLE})
            else
                cell_toolbars.push(item_name)

        @render_menu
            heading  : 'View'
            disabled : @props.read_only
            names    : \
                ['toggle header', toolbar, 'toggle all line numbers', '', \
                 '<Cell Toolbar...'].concat(cell_toolbars).concat(['', \
                 'zoom in', 'zoom out', '', \
                 "<Show Notebook as...", shownb.normal, shownb.raw, shownb.json])

    render_insert: ->
        @render_menu
            heading   : 'Insert'
            names     : ['insert cell above', 'insert cell below']
            min_width : '15em'
            disabled  : @props.read_only

    render_cell: ->
        @render_menu
            heading  : 'Cell'
            disabled : @props.read_only
            names    : [\
                'run cell', 'run cell and select next', 'run cell and insert below', \
                'run all cells', 'run all cells above', 'run all cells below', '', \
                '<Cell Type...',\
                '>change cell to code', '>change cell to markdown', '>change cell to raw', '', \
                '<Current Output...',\
                '>toggle cell output collapsed', '>toggle cell output scrolled', '>clear cell output', '', \
                '<All Output...',\
                '>toggle all cells output collapsed', '>toggle all cells output scrolled', '>clear all cells output'
            ]

    # TODO: upper case kernel names, descriptions... and make it a new component for
    # efficiency so don't re-render if not change
    render_kernel_item: (kernel) ->
        style = {marginLeft:'4ex'}
        if kernel.name == @props.kernel
            style.color = '#2196F3'
            style.fontWeight = 'bold'
        <MenuItem
            key      = {kernel.name}
            eventKey = "kernel-change-#{kernel.name}"
            onSelect = {=>@props.actions.set_kernel(kernel.name); @focus(); @props.actions.set_default_kernel(kernel.name)}
            >
            <span style={style}> {kernel.display_name} </span>
        </MenuItem>

    render_kernel_items: ->
        if not @props.kernels?
            return
        else
            kernels = @props.kernels.toJS()
            for kernel in kernels
                @render_kernel_item(kernel)

    render_kernel: ->
        items = @render_kernel_items()
        names = ["#{if @props.kernel_state != 'busy' then '<' else ''}interrupt kernel", 'confirm restart kernel', 'confirm restart kernel and clear output', \
                 'confirm restart kernel and run all cells', '', \
                 '<Change kernel...'].concat(items).concat(['', 'refresh kernels'])

        @render_menu
            heading  : 'Kernel'
            names    : names
            disabled : @props.read_only

    focus: ->
        $(":focus").blur() # battling with react-bootstrap stupidity... ?
        @props.actions.focus(true)

    command: (name) ->
        return =>
            @props.actions?.command(name)
            $(":focus").blur() # battling with react-bootstrap stupidity... ?
            if misc.endswith(@props.actions._commands?[name]?.m, '...')
                @props.actions.blur()
            else
                @focus()

    menu_item: (key, name) ->
        # TODO: this got complicated and should be its own component
        if name
            if name.props?
                return name  # it's already a MenuItem components
            if typeof(name) == 'object'
                # use {name:'>nbconvert script', display:"Executable Script (.zzz)..."}, say, to be explicit about custom name to show
                {name, display, style} = name
                if style?
                    style = misc.copy(style)
            else
                display = undefined
            style ?= {}
            if name[0] == '<'
                disabled = true
                name = name.slice(1)
            else
                disabled = false

            if name[0] == '>'
                style.marginLeft = '4ex'
                name = name.slice(1)
            obj = @props.actions._commands?[name]
            if not obj?
                return <MenuItem disabled={disabled} key={key}><span style={style}>{display ? name}</span></MenuItem>

            shortcut = obj.k?[0]
            if shortcut?
                s = <span className='pull-right'><KeyboardShortcut shortcut={shortcut} /></span>
            else
                s = <span/>

            <MenuItem
                key      = {key}
                onSelect = {@command(name)}
                disabled = {disabled}
                >
                <span style={style}>
                    {s} {display ? obj.m ? name}   {### shortcut must be first! -- https://github.com/sagemathinc/cocalc/issues/1935 ###}
                </span>
            </MenuItem>
        else
            <MenuItem key={key} divider />

    menu_items: (names) ->
        return (@menu_item(key, name) for key, name of names)

    render_menu: (opts) ->
        {heading, names, opacity, min_width} = defaults opts,
            heading   : required
            names     : required
            opacity   : 1
            min_width : '20em'
            disabled  : false
        <Dropdown key={heading} id={heading} disabled={opts.disabled}>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                {heading}
            </Dropdown.Toggle>
            <Dropdown.Menu style={opacity:opacity, minWidth:min_width}>
                {@menu_items(names)}
            </Dropdown.Menu>
        </Dropdown>

    ###
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
    ###

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
        <Dropdown key='help'  id='menu-help' className='hidden-xs'>
            <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
                Help
            </Dropdown.Toggle>
            <Dropdown.Menu>
                <MenuItem eventKey="help-about" onSelect = {=>@props.actions.show_about()} ><Icon name='question-circle'/>  About...</MenuItem>
                <MenuItem divider />
                <MenuItem eventKey="help-keyboard" onClick={@command("edit keyboard shortcuts")}><Icon name='keyboard-o'/>  Keyboard shortcuts...</MenuItem>
                <MenuItem divider />
                {external_link('Notebook help', 'http://nbviewer.jupyter.org/github/ipython/ipython/blob/3.x/examples/Notebook/Index.ipynb')}
                {external_link('Jupyter in CoCalc','https://github.com/sagemathinc/cocalc/wiki/sagejupyter')}
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

