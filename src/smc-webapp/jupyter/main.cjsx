###
Top-level react component, which ties everything together
###

{ErrorDisplay, Icon, Loading} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

# React components that implement parts of the Jupyter notebook.

{TopMenubar}   = require('./top-menubar')
{TopButtonbar} = require('./top-buttonbar')
{CellList}     = require('./cell-list')
{Introspect}   = require('./introspect')
#{CellList}     = require('./cell-list-single-editor')
{Kernel, Mode} = require('./status')
keyboard = require('./keyboard')

exports.JupyterEditor = rclass ({name}) ->
    propTypes :
        error   : rtypes.string
        actions : rtypes.object.isRequired

    componentDidMount: ->
        keyboard.enable_handler(@props.actions)

    componentWillUnmount: ->
        keyboard.disable_handler(@props.actions)

    reduxProps :
        "#{name}" :
            kernel              : rtypes.string                     # string name of the kernel
            error               : rtypes.string
            toolbar             : rtypes.bool
            has_unsaved_changes : rtypes.bool
            cell_list           : rtypes.immutable.List             # list of ids of cells in order
            cells               : rtypes.immutable.Map              # map from ids to cells
            cur_id              : rtypes.string
            sel_ids             : rtypes.immutable.Set.isRequired   # set of selected cells
            mode                : rtypes.string.isRequired          # 'edit' or 'escape'
            font_size           : rtypes.number
            md_edit_ids         : rtypes.immutable.Set.isRequired   # ids of markdown cells in edit mode
            cm_options          : rtypes.immutable.Map              # settings for all the codemirror editors
            project_id          : rtypes.string
            directory           : rtypes.string
            version             : rtypes.object
            complete            : rtypes.immutable.Map              # status of tab completion
            introspect          : rtypes.immutable.Map              # status of introspection

    render_error: ->
        if @props.error
            <ErrorDisplay
                error = {@props.error}
                onClose = {=>@props.actions.set_error(undefined)}
            />

    render_kernel: ->
        <span>
            <Kernel name={@props.name} actions={@props.actions} />
            <Mode   name={@props.name} />
        </span>

    render_menubar: ->
        <TopMenubar actions = {@props.actions} name={name} />

    render_buttonbar: ->
        <TopButtonbar actions={@props.actions} name={name} />

    render_heading: ->
        <div style={boxShadow: '0px 0px 12px 1px rgba(87, 87, 87, 0.2)', zIndex: 100}>
            {@render_kernel()}
            {@render_menubar()}
            {@render_buttonbar() if @props.toolbar}
        </div>

    render_cells: ->
        if not @props.cell_list? or not @props.font_size?
            return <Loading style={fontSize: '24pt', textAlign: 'center', marginTop: '15px', color: '#888'} />
        <CellList
            actions     = {@props.actions}
            cell_list   = {@props.cell_list}
            cells       = {@props.cells}
            font_size   = {@props.font_size}
            sel_ids     = {@props.sel_ids}
            md_edit_ids = {@props.md_edit_ids}
            cur_id      = {@props.cur_id}
            mode        = {@props.mode}
            cm_options  = {@props.cm_options}
            project_id  = {@props.project_id}
            directory   = {@props.directory}
            scrollTop   = {@props.actions.store.get_scroll_state()}
            complete    = {@props.complete}
            />

    render_introspect: ->
        if not @props.introspect?
            return
        <Introspect
            actions    = {@props.actions}
            introspect = {@props.introspect}
            font_size  = {@props.font_size}
            />

    render: ->
        <div style={display: 'flex', flexDirection: 'column', height: '100%', overflowY:'hidden'}>
            {@render_error()}
            {@render_heading()}
            {@render_cells()}
            {@render_introspect()}
        </div>

    ###
    render: ->
        {HistoryViewer} = require('./history-viewer')
        <HistoryViewer
            syncdb     = {@props.actions.syncdb}
            version    = {@props.version}
            />
    ###