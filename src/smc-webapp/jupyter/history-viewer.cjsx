###
History viewer for Jupyter notebooks
###

immutable  = require('immutable')


{React, ReactDOM, rclass, rtypes, redux}  = require('../smc-react')

misc         = require('smc-util/misc')
util         = require('./util')

{CellList}   = require('./cell-list')
{cm_options} = require('./cm_options')

exports.HistoryViewer = HistoryViewer = rclass
    propTypes :
        syncdb     : rtypes.object.isRequired   # syncdb object corresponding to a jupyter notebook
        version    : rtypes.object

    render_cells: ->
        project_id = @props.syncdb.get_project_id()
        directory  = misc.path_split(@props.syncdb.get_path())?.head
        settings   = @props.syncdb.get_one(type:'settings', @props.version)
        cells      = immutable.Map()
        @props.syncdb.get(type:'cell', @props.version)?.forEach (cell) ->
            cells = cells.set(cell.get('id'), cell)
            return
        cell_list  = util.sorted_cell_list(cells)

        <CellList
            cell_list  = {cell_list}
            cells      = {cells}
            font_size  = {redux.getStore('account')?.get('font_size') ? 14}
            mode       = 'escape'
            cm_options = {cm_options(settings?.kernel)}
            project_id = {project_id}
            directory  = {directory}
            />

    render: ->
        <div style={display: 'flex', flexDirection: 'column', height: '100%', overflowY:'hidden'}>
            {@render_cells()}
        </div>

# The following is just for integrating the history viewer
# with
exports.jupyter_history_viewer_jquery_shim = (syncdb) ->
    elt = $("<div class='smc-vfill'></div>")

    obj =
        element     : elt
        show        : -> elt.show()
        hide        : -> elt.hide()
        remove      : -> ReactDOM.unmountComponentAtNode(elt[0])
        set_version : (version) ->
            ReactDOM.render(<HistoryViewer syncdb={syncdb} version={version} />, elt[0])

    return obj



