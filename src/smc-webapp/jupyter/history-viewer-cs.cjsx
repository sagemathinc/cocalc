###
History viewer for Jupyter notebooks
###

immutable  = require('immutable')

{React, ReactDOM, rclass, rtypes, redux, Redux}  = require('../app-framework')

misc         = require('smc-util/misc')
cell_utils   = require('./cell-utils')

{CellList}   = require('./cell-list')
{cm_options} = require('./cm_options')

get_cells = (syncdb, version) ->
    cells      = immutable.Map()
    syncdb.get(type:'cell', version)?.forEach (cell) ->
        cells = cells.set(cell.get('id'), cell)
        return
    cell_list  = cell_utils.sorted_cell_list(cells)
    return {cells:cells, cell_list:cell_list}

exports.HistoryViewer = HistoryViewer = rclass
    propTypes :
        syncdb     : rtypes.object.isRequired   # syncdb object corresponding to a jupyter notebook
        version    : rtypes.object

    render_cells: ->
        project_id = @props.syncdb.get_project_id()
        directory  = misc.path_split(@props.syncdb.get_path())?.head
        {cells, cell_list} = get_cells(@props.syncdb, @props.version)

        options = immutable.fromJS
            markdown : undefined
            options  : cm_options()   # TODO

        <CellList
            cell_list  = {cell_list}
            cells      = {cells}
            font_size  = {redux.getStore('account')?.get('font_size') ? 14}
            mode       = 'escape'
            cm_options = {options}
            project_id = {project_id}
            directory  = {directory}
            trust      = {false}
            />

    render: ->
        <div style={display: 'flex', flexDirection: 'column', height: '100%', overflowY:'hidden'}>
            {@render_cells()}
        </div>

# The following is just for integrating the history viewer.
{export_to_ipynb} = require('./export-to-ipynb')
json_stable = require('json-stable-stringify')

exports.jupyter_history_viewer_jquery_shim = (syncdb) ->
    elt = $("<div class='smc-vfill'></div>")

    obj =
        element     : elt
        show        : -> elt.show()
        hide        : -> elt.hide()
        remove      : -> ReactDOM.unmountComponentAtNode(elt[0])
        set_version : (version) ->
            ReactDOM.render(<Redux redux={redux}><HistoryViewer syncdb={syncdb} version={version} /></Redux>, elt[0])
        to_str      : (version) ->
            ipynb = export_to_ipynb(get_cells(syncdb, version))
            return json_stable(ipynb, {space:1})

    return obj



