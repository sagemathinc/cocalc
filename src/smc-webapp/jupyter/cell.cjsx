###
React component that describes a single cell
###

misc_page = require('../misc_page')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Loading}    = require('../r_misc')

{CellInput}  = require('./cell-input')
{CellOutput} = require('./cell-output')

exports.Cell = rclass ({name}) ->
    propTypes :
        actions    : rtypes.object.isRequired
        id         : rtypes.string.isRequired
        cm_options : rtypes.object.isRequired

    reduxProps :
        "#{name}" :
            cells   : rtypes.immutable.Map   # map from id to cells
            cur_id  : rtypes.string          # id of currently selected cell
            sel_ids : rtypes.immutable.Set   # set of selected cells
            mode    : rtypes.string          # 'edit' or 'escape'

    render_cell_input: (cell) ->
        <CellInput
            key        = 'in'
            cell       = {cell}
            actions    = {@props.actions}
            cm_options = {@props.cm_options}
            id         = {@props.id}
            />

    render_cell_output: (cell) ->
        <CellOutput
            key        = 'out'
            cell       = {cell}
            />

    click_on_cell: (event) ->
        if event.shiftKey
            misc_page.clear_selection()
            @props.actions.select_cell_range(@props.id)
        else
            @props.actions.set_cur_id(@props.id)
            @props.actions.unselect_all_cells()

    render: ->
        selected = @props.sel_ids?.contains(@props.id)
        if @props.cur_id == @props.id
            # currently selected cell
            if @props.mode == 'edit'
                # edit mode
                color1 = color2 = '#66bb6a'
            else
                # escape mode
                color1 = '#ababab'
                color2 = '#42a5f5'
        else
            if selected
                color1 = color2 = '#e3f2fd'
            else
                color1 = color2 = 'white'
        style =
            border          : "1px solid #{color1}"
            borderLeft      : "5px solid #{color2}"
            padding         : '5px'

        if selected
            style.background = '#e3f2fd'

        cell = @props.cells.get(@props.id)

        <div style={style} onClick={@click_on_cell}>
            {@render_cell_input(cell)}
            {@render_cell_output(cell)}
        </div>