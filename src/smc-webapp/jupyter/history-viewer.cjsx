###
History viewer for Jupyter notebooks
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

immutable  = require('immutable')

util       = require('./util')

{CellList} = require('./cell-list')

{cm_options} = require('./cm_options')

exports.HistoryViewer = rclass
    propTypes :
        syncdb     : rtypes.object.isRequired   # syncdb object corresponding to a jupyter notebook
        version    : rtypes.object
        project_id : rtypes.string
        directory  : rtypes.string

    render_cells: ->
        settings = @props.syncdb.get_one(type:'settings', @props.version)
        # TODO: factor this out in a separate file (also in actions); and use the settings info

        cells = immutable.Map()
        @props.syncdb.get(type:'cell', @props.version)?.forEach (cell) ->
            cells = cells.set(cell.get('id'), cell)
            return

        cell_list = util.sorted_cell_list(cells)

        <CellList
            cell_list  = {cell_list}
            cells      = {cells}
            font_size  = {14}
            mode       = 'escape'
            cm_options = {cm_options(settings?.kernel)}
            project_id = {@props.project_id}
            directory  = {@props.directory}
            />

    render: ->
        <div style={display: 'flex', flexDirection: 'column', height: '100%', overflowY:'hidden'}>
            {@render_cells()}
        </div>
