###
Top-level react component, which ties everything together

###

{ErrorDisplay, Icon, Loading} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

# React components that implement parts of the Jupyter notebook.

{TopMenubar}   = require('./top-menubar')
{TopButtonbar} = require('./top-buttonbar')
{CellList}     = require('./cell-list')

exports.JupyterEditor = rclass ({name}) ->
    propTypes :
        error      : rtypes.string
        actions    : rtypes.object.isRequired

    reduxProps :
        "#{name}" :
            kernel    : rtypes.string          # string name of the kernel
            error     : rtypes.string

    render_error: ->
        if @props.error
            <ErrorDisplay
                error = {@props.error}
                onClose = {=>@props.actions.set_error(undefined)}
            />

    render_kernel: ->
        <div className='pull-right' style={color:'#666'}>
            Python 2 (SageMath)
        </div>

    render_menubar: ->
        <TopMenubar actions = {@props.actions} />

    render_buttonbar: ->
        <TopButtonbar actions = {@props.actions} />

    render_heading: ->
        <div style={boxShadow: '0px 0px 12px 1px rgba(87, 87, 87, 0.2)', zIndex: 100}>
            {@render_menubar()}
            {@render_kernel()}
            {@render_buttonbar()}
        </div>

    render_cells: ->
        <CellList
            name    = {name}
            actions = {@props.actions}
            />

    render: ->
        if not @props.cells? or not @props.cell_list?
            return <Loading/>
        <div style={display: 'flex', flexDirection: 'column', height: '100%', overflowY:'hidden'}>
            {@render_error()}
            {@render_heading()}
            {@render_cells()}
        </div>

