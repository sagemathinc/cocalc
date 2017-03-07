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

{Button, ButtonGroup, Well} = require('react-bootstrap')

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

    render_heading: ->
        <div style={boxShadow: '0px 0px 12px 1px rgba(87, 87, 87, 0.2)', zIndex: 100}>
            <span style={padding:'15px', fontSize:'35px', color:'#444'}>jupyter</span>
            <span style={padding:'15px', fontSize:'25px'}>{@props.title}</span>
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

        <div style={paddingLeft:'20px', paddingTop:'20px',  backgroundColor:'#eee', height: '100%'}>
            <div style={backgroundColor:'#fff', padding:'15px', boxShadow: '0px 0px 12px 1px rgba(87, 87, 87, 0.2)'}>
                {v}
            </div>
        </div>

    render: ->
        if not @props.title? or not @props.cells?
            return <Loading/>
        <div style={display: 'flex', flexDirection: 'column', height: '100%'}>
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
