###
Top-level react component, which ties everything together
###

{ErrorDisplay, Icon, Loading} = require('../r_misc')

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

# React components that implement parts of the Jupyter notebook.

{TopMenubar}        = require('./top-menubar')
{TopButtonbar}      = require('./top-buttonbar')
{CellList}          = require('./cell-list')
{Introspect}        = require('./introspect')
{Kernel, Mode}      = require('./status')
{About}             = require('./about')
{NBConvert}         = require('./nbconvert')
{InsertImage}       = require('./insert-image')
{EditAttachments}   = require('./edit-attachments')
{EditCellMetadata}  = require('./edit-cell-metadata')
{FindAndReplace}    = require('./find-and-replace')
{ConfirmDialog}     = require('./confirm-dialog')
{KeyboardShortcuts} = require('./keyboard-shortcuts')
{JSONView}          = require('./json-view')
{RawEditor}         = require('./raw-editor')
{ExamplesDialog}    = require('smc-webapp/assistant/dialog')

KERNEL_STYLE =
    position        : 'absolute'
    right           : 0
    paddingLeft     : '5px'
    backgroundColor : '#eee'

exports.JupyterEditor = rclass ({name}) ->
    propTypes :
        error   : rtypes.string
        actions : rtypes.object.isRequired

    reduxProps :
        "#{name}" :
            view_mode           : rtypes.oneOf(['normal', 'json', 'raw'])
            kernel              : rtypes.string                     # string name of the kernel
            error               : rtypes.string
            fatal               : rtypes.string                     # *FATAL* error; user must edit file to fix.
            toolbar             : rtypes.bool
            has_unsaved_changes : rtypes.bool
            cell_list           : rtypes.immutable.List             # list of ids of cells in order
            cells               : rtypes.immutable.Map              # map from ids to cells
            cur_id              : rtypes.string
            sel_ids             : rtypes.immutable.Set.isRequired   # set of selected cells
            mode                : rtypes.oneOf(['edit', 'escape']).isRequired
            font_size           : rtypes.number
            md_edit_ids         : rtypes.immutable.Set.isRequired   # ids of markdown cells in edit mode
            cm_options          : rtypes.immutable.Map              # settings for all the codemirror editors
            project_id          : rtypes.string
            directory           : rtypes.string
            version             : rtypes.object
            complete            : rtypes.immutable.Map              # status of tab completion
            introspect          : rtypes.immutable.Map              # status of introspection
            is_focused          : rtypes.bool
            more_output         : rtypes.immutable.Map
            about               : rtypes.bool
            backend_kernel_info : rtypes.immutable.Map
            confirm_dialog      : rtypes.immutable.Map
            find_and_replace    : rtypes.bool
            keyboard_shortcuts  : rtypes.immutable.Map
            scroll              : rtypes.oneOfType([rtypes.number, rtypes.string])
            nbconvert           : rtypes.immutable.Map  # backend convert state
            nbconvert_dialog    : rtypes.immutable.Map  # frontend modal dialog state
            path                : rtypes.string
            cell_toolbar        : rtypes.string
            insert_image        : rtypes.bool  # show insert image dialog
            edit_attachments    : rtypes.string
            edit_cell_metadata  : rtypes.immutable.Map
            editor_settings     : rtypes.immutable.Map
            raw_ipynb           : rtypes.immutable.Map
            metadata            : rtypes.immutable.Map
            trust               : rtypes.bool

    render_error: ->
        if @props.error
            <ErrorDisplay
                error   = {@props.error}
                style   = {margin:'1ex'}
                onClose = {=>@props.actions.set_error(undefined)}
            />

    render_fatal: ->
        if @props.fatal
            <div>
                <h2 style={marginLeft:'10px'}>Fatal Error loading ipynb file</h2>

                <ErrorDisplay
                    error   = {@props.fatal}
                    style   = {margin:'1ex'}
                />

            </div>

    render_kernel: ->
        <span style={KERNEL_STYLE}>
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
        if not @props.cell_list? or not @props.font_size? or not @props.cm_options?
            return <Loading style={fontSize: '24pt', textAlign: 'center', marginTop: '15px', color: '#888'} />
        <CellList
            actions      = {@props.actions}
            cell_list    = {@props.cell_list}
            cells        = {@props.cells}
            font_size    = {@props.font_size}
            sel_ids      = {@props.sel_ids}
            md_edit_ids  = {@props.md_edit_ids}
            cur_id       = {@props.cur_id}
            mode         = {@props.mode}
            cm_options   = {@props.cm_options}
            project_id   = {@props.project_id}
            directory    = {@props.directory}
            scrollTop    = {@props.actions.store.get_scroll_state()}
            complete     = {@props.complete}
            is_focused   = {@props.is_focused}
            more_output  = {@props.more_output}
            scroll       = {@props.scroll}
            cell_toolbar = {@props.cell_toolbar}
            trust        = {@props.trust}
            />

    render_introspect: ->
        if not @props.introspect?
            return
        <Introspect
            actions    = {@props.actions}
            introspect = {@props.introspect}
            font_size  = {@props.font_size}
            />

    render_about: ->
        <About
            actions             = {@props.actions}
            about               = {@props.about}
            backend_kernel_info = {@props.backend_kernel_info}
            />

    render_nbconvert: ->
        <NBConvert
            actions             = {@props.actions}
            path                = {@props.path}
            nbconvert           = {@props.nbconvert}
            nbconvert_dialog    = {@props.nbconvert_dialog}
            backend_kernel_info = {@props.backend_kernel_info}
            project_id          = {@props.project_id}
            />

    render_insert_image: ->
        if not @props.cur_id? or not @props.project_id?
            return
        <InsertImage
            actions      = {@props.actions}
            cur_id       = {@props.cur_id}
            project_id   = {@props.project_id}
            insert_image = {@props.insert_image}
        />

    render_edit_attachments: ->
        if not @props.edit_attachments?
            return
        cell = @props.cells?.get(@props.edit_attachments)
        if not cell?
            return
        <EditAttachments
            actions = {@props.actions}
            cell    = {cell}
        />

    render_edit_cell_metadata: ->
        if not @props.edit_cell_metadata?
            return
        <EditCellMetadata
            actions    = {@props.actions}
            id         = {@props.edit_cell_metadata.get('id')}
            metadata   = {@props.edit_cell_metadata.get('metadata')}
            font_size  = {@props.font_size}
            cm_options = {@props.cm_options.get('options')}
        />

    render_find_and_replace: ->
        if not @props.cells?
            return
        <FindAndReplace
            actions          = {@props.actions}
            find_and_replace = {@props.find_and_replace}
            sel_ids          = {@props.sel_ids}
            cur_id           = {@props.cur_id}
            cells            = {@props.cells}
            cell_list        = {@props.cell_list}
        />

    render_confirm_dialog: ->
        <ConfirmDialog
            actions        = {@props.actions}
            confirm_dialog = {@props.confirm_dialog}
        />

    render_keyboard_shortcuts: ->
        <KeyboardShortcuts
            actions            = {@props.actions}
            keyboard_shortcuts = {@props.keyboard_shortcuts}
        />

    render_assistant_dialog: ->
        <ExamplesDialog
            name     = {@props.actions.assistant_actions.name}
            actions  = {@props.actions.assistant_actions}
        />

    render_json_viewer: ->
        <JSONView
            actions   = {@props.actions}
            cells     = {@props.cells}
            font_size = {@props.font_size}
            kernel    = {@props.kernel}
        />

    render_raw_editor: ->
        if not @props.raw_ipynb? or not @props.cm_options?
            return <Loading/>
        <RawEditor
            actions    = {@props.actions}
            font_size  = {@props.font_size}
            raw_ipynb  = {@props.raw_ipynb}
            cm_options = {@props.cm_options.get('options')}
        />

    render_main_view: ->
        switch @props.view_mode
            when 'json'
                return @render_json_viewer()
            when 'raw'
                return @render_raw_editor()
            when 'normal'
                return @render_cells()
            else
                return @render_cells()

    render: ->
        if @props.fatal
            return @render_fatal()
        <div style={display: 'flex', flexDirection: 'column', height: '100%', overflowY:'hidden'}>
            {@render_error()}
            {@render_about()}
            {@render_nbconvert()}
            {@render_insert_image()}
            {@render_edit_attachments()}
            {@render_edit_cell_metadata()}
            {@render_find_and_replace()}
            {@render_keyboard_shortcuts()}
            {@render_assistant_dialog()}
            {@render_confirm_dialog()}
            {@render_heading()}
            {@render_main_view()}
            {@render_introspect()}
        </div>
