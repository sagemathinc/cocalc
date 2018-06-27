###
React component to render a sage worksheet statically (for use by share server or public mode)
###

{rclass, React, rtypes} = require('../app-framework')

misc = require('smc-util/misc')

{Cell} = require('./cell')

exports.Worksheet = rclass
    displayName: "SageWorksheet"

    propTypes :
        sagews : rtypes.array.isRequired
        style  : rtypes.object

    render_cell: (cell) ->
        <Cell key={cell.id} input={cell.input} output={cell.output} flags={cell.flags} />

    render_cells: ->
        cells = (cell for cell in @props.sagews when cell.type == 'cell')
        cells.sort(misc.field_cmp('pos'))
        for cell in cells
            @render_cell(cell)

    render: ->
        <div style={@props.style}>
            {@render_cells()}
        </div>
