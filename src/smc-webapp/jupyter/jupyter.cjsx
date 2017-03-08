###
Jupyter client

The goal here is to make a simple proof of concept editor for working with
Jupyter notebooks.  The goals are:
 1. to **look** like the normal jupyter notebook
 2. work like the normal jupyter notebook
 3. work perfectly regarding realtime sync and history browsing
###

immutable = require('immutable')

{React, ReactDOM, rclass, rtypes, Redux, Actions, Store, redux_name}  = require('../smc-react')

{ErrorDisplay, Icon, Loading} = require('../r_misc')

{Button, ButtonGroup, ButtonToolbar, Clearfix, DropdownButton, Form,
 FormControl, MenuItem, Overlay, OverlayTrigger, Popover, Well} = require('react-bootstrap')

{salvus_client} = require('../salvus_client')

misc = require('smc-util/misc')
{defaults, required} = misc

{alert_message} = require('../alerts')


###
The React components
###

JupyterEditor = rclass ({name}) ->
    propTypes :
        error      : rtypes.string
        actions    : rtypes.object.isRequired

    reduxProps :
        "#{name}" :
            title  : rtypes.string          # title of the notebook
            kernel : rtypes.string         # string name of the kernel
            cells  : rtypes.immutable.List  # ordered list of cells
            error  : rtypes.string

    render_error: ->
        if @props.error
            <ErrorDisplay
                error = {@props.error}
                onClose = {=>@props.actions.set_error(undefined)}
            />

    render_menubar_file: ->
        <DropdownButton noCaret bsStyle='default' title='File' key='file' id='menu-file'>
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

    render_menubar_edit: ->
        <DropdownButton noCaret bsStyle='default' title='Edit' key='edit'  id='menu-edit'>
            <MenuItem eventKey="cut-cells">Undo</MenuItem>
            <MenuItem eventKey="copy-cells">Redo</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="cut-cells">Cut Cells</MenuItem>
            <MenuItem eventKey="copy-cells">Copy Cells</MenuItem>
            <MenuItem eventKey="paste-cells-above">Paste Cells Above</MenuItem>
            <MenuItem eventKey="paste-cells-below">Paste Cells Below</MenuItem>
            <MenuItem eventKey="paste-cells-and-replace">Paste Cells & Replace</MenuItem>
            <MenuItem eventKey="delete-cells">Delete Cells</MenuItem>
            <MenuItem eventKey="undo-delete-cells">Undo Delete Cells</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="split-cell">Split Cell</MenuItem>
            <MenuItem eventKey="merge-cell-above">Merge Cell Above</MenuItem>
            <MenuItem eventKey="merge-cell-below">Merge Cell Below</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="move-cell-up">Move Cell Up</MenuItem>
            <MenuItem eventKey="move-cell-down">Move Cell Down</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="edit-notebook-metadata">Edit Notebook Metadata</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="find-and-replace">Find and Replace</MenuItem>
        </DropdownButton>

    render_menubar_view: ->
        <DropdownButton noCaret bsStyle='default' title='View' key='view'  id='menu-view'>
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

    render_menubar_insert: ->
        <DropdownButton noCaret bsStyle='default' title='Insert' key='insert'  id='menu-insert'>
            <MenuItem eventKey="insert-cell-above">Insert Cell Above</MenuItem>
            <MenuItem eventKey="insert-cell-below">Insert Cell Below</MenuItem>
        </DropdownButton>

    render_menubar_cell: ->
        <DropdownButton noCaret bsStyle='default' title='Cell' key='cell'  id='menu-cell'>
            <MenuItem eventKey="run-cells">Run Cells</MenuItem>
            <MenuItem eventKey="run-cells-select-below">Run Cells and Select Below</MenuItem>
            <MenuItem eventKey="run-cells-insert-below">Run Cells and Insert Below</MenuItem>
            <MenuItem eventKey="run-all">Run All</MenuItem>
            <MenuItem eventKey="run-all-below">Run All Above</MenuItem>
            <MenuItem eventKey="run-all-below">Run All Below</MenuItem>
            <MenuItem divider />
            <MenuItem eventKey="" disabled>Cell Type...</MenuItem>
            <MenuItem eventKey="cell-type-code"     ><span style={marginLeft:'4ex'}/> Code</MenuItem>
            <MenuItem eventKey="cell-type-markdown" ><span style={marginLeft:'4ex'}/> Markdown</MenuItem>
            <MenuItem eventKey="cell-type-nbconvert"><span style={marginLeft:'4ex'}/> Raw NBConvert</MenuItem>
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
    render_menubar_kernel: ->
        <DropdownButton noCaret bsStyle='default' title='Kernel' key='kernel'  id='menu-kernel'>
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

    render_menubar_widgets: ->
        <DropdownButton noCaret bsStyle='default' title='Widgets' key='widgets'  id='menu-widgets'>
            <MenuItem eventKey="widgets-save-with-snapshots">Save notebook with snapshots</MenuItem>
            <MenuItem eventKey="widgets-download">Download widget state</MenuItem>
            <MenuItem eventKey="widgets-embed">Embed widgets</MenuItem>
        </DropdownButton>

    render_menubar_help: ->
        <DropdownButton noCaret bsStyle='default' title='Help' key='help'  id='menu-help'>
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

    render_kernel: ->
        <div className='pull-right' style={color:'#666'}>
            Python 2 (SageMath)
        </div>

    render_menubar: ->
        <div style={padding: '5px', backgroundColor:'rgb(247,247,247)'}>
            <ButtonGroup>
                {@render_menubar_file()}
                {@render_menubar_edit()}
                {@render_menubar_view()}
                {@render_menubar_insert()}
                {@render_menubar_cell()}
                {@render_menubar_kernel()}
                {@render_menubar_widgets()}
                {@render_menubar_help()}
            </ButtonGroup>
            {@render_kernel()}
        </div>

    render_button_add_cell: ->
        <Button>
            <Icon name='plus'/>
        </Button>

    render_button_group_edit: ->
        <ButtonGroup  style={marginLeft:'5px'}>
            <Button>
                <Icon name='scissors'/>
            </Button>
            <Button>
                <Icon name='files-o'/>
            </Button>
            <Button>
                <Icon name='clipboard'/>
            </Button>
        </ButtonGroup>

    render_button_group_move: ->
        <ButtonGroup  style={marginLeft:'5px'}>
            <Button>
                <Icon name='arrow-up'/>
            </Button>
            <Button>
                <Icon name='arrow-down'/>
            </Button>
        </ButtonGroup>

    render_button_group_run: ->
        <ButtonGroup  style={marginLeft:'5px'}>
            <Button>
                <Icon name='step-forward'/>
            </Button>
            <Button>
                <Icon name='stop'/>
            </Button>
            <Button>
                <Icon name='repeat'/>
            </Button>
        </ButtonGroup>

    render_select_cell_type: ->
        <FormControl style={marginLeft:'5px'} componentClass="select" placeholder="select">
            <option value="code">Code</option>
            <option value="markdown">Markdown</option>
            <option value="raw-nbconvert">Raw NBConvert</option>
            <option value="heading">Heading</option>
        </FormControl>

    render_button_keyboard: ->
        <Button style={marginLeft:'5px'}>
            <Icon name='keyboard-o'/>
        </Button>


    render_buttonbar: ->
        <div style={margin: '5px', backgroundColor:'#fff'}>
            <Form inline>
                {@render_button_add_cell()}
                {@render_button_group_edit()}
                {@render_button_group_move()}
                {@render_button_group_run()}
                {@render_select_cell_type()}
                {@render_button_keyboard()}
            </Form>
        </div>

    render_heading: ->
        <div style={boxShadow: '0px 0px 12px 1px rgba(87, 87, 87, 0.2)', zIndex: 100}>
            {@render_menubar()}
            {@render_buttonbar()}
        </div>

    render_cell_input: (cell) ->
        <div key='in' style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
            <div style={color:'#303F9F', minWidth: '14ex', fontFamily: 'monospace', textAlign:'right', padding:'.4em'}>
                In [{cell.get('number') ? '*'}]:
            </div>
            <pre style={width:'100%', backgroundColor: '#f7f7f7'}>
                {cell.get('input') ? ''}
            </pre>
        </div>

    render_output_number: (n) ->
        if not n
            return
        <span>
            Out[{n}]:
        </span>

    render_cell_output: (cell) ->
        if not cell.get('output')?
            return
        n = cell.get('number')
        <div key='out'  style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
            <div style={color:'#D84315', minWidth: '14ex', fontFamily: 'monospace', textAlign:'right', padding:'.4em'}>
                {@render_output_number(n)}
            </div>
            <pre style={width:'100%', backgroundColor: '#fff', border: 0}>
                {cell.get('output') ? ''}
            </pre>
        </div>

    render_cell: (cell) ->
        <div key={cell.get('id')}>
            {@render_cell_input(cell)}
            {@render_cell_output(cell)}
        </div>

    render_cells: ->
        v = []

        @props.cells.map (cell) =>
            v.push(@render_cell(cell))
            return

        <div style={paddingLeft:'20px', padding:'20px',  backgroundColor:'#eee', height: '100%', overflowY:'scroll'}>
            <div style={backgroundColor:'#fff', padding:'15px', boxShadow: '0px 0px 12px 1px rgba(87, 87, 87, 0.2)'}>
                {v}
            </div>
        </div>

    render: ->
        if not @props.title? or not @props.cells?
            return <Loading/>
        <div style={display: 'flex', flexDirection: 'column', height: '100%', overflowY:'hidden'}>
            {@render_error()}
            {@render_heading()}
            {@render_cells()}
        </div>



###
The actions -- what you can do with a jupyter notebook, and also the
underlying synchronized state.
###

class JupyterActions extends Actions

    _init: () =>

    set_error: (err) =>
        @setState
            error : err

    _syncdb_change: =>
        # TODO: this is not efficient!
        @setState
            cells : @syncdb.get(type:'cell')
            title : @syncdb.get_one(type:'settings')?.get('title')

    _set: (obj) =>
        @syncdb.set(obj)
        @syncdb.save()  # save to file on disk


###
Register this editor with SMC
  - set the file extension, icon, react component,
    and how to init and remove the actions/store
###

require('../project_file').register_file_editor
    ext       : ['ipynb2']

    is_public : false

    icon      : 'list-alt'

    component : JupyterEditor

    init      : (path, redux, project_id) ->
        name = redux_name(project_id, path)
        if redux.getActions(name)?
            return name  # already initialized

        actions = redux.createActions(name, JupyterActions)
        store   = redux.createStore(name)

        actions._init()

        syncdb = salvus_client.sync_db
            project_id   : project_id
            path         : misc.meta_file(path, 'cocalc')
            primary_keys : ['type', 'id']
            string_cols  : ['input']
        actions.syncdb = syncdb
        actions.store  = store
        window.a = actions # for debugging.
        syncdb.once 'init', (err) =>
            if err
                mesg = "Error opening '#{path}' -- #{err}"
                console.warn(mesg)
                alert_message(type:"error", message:mesg)
                return
            actions._syncdb_change()
            syncdb.on('change', actions._syncdb_change)  # TODO: make efficient
        return name

    remove    : (path, redux, project_id) ->
        name = redux_name(project_id, path)
        actions = redux.getActions(name)
        actions?.syncdb?.close()
        store = redux.getStore(name)
        if not store?
            return
        delete store.state
        # It is *critical* to first unmount the store, then the actions,
        # or there will be a huge memory leak.
        redux.removeStore(name)
        redux.removeActions(name)
        return name
