###
React component that describes a single cell
###

misc_page = require('../misc_page')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Loading}    = require('../r_misc')

{CellInput}  = require('./cell-input')
{CellOutput} = require('./cell-output')

{CellTiming} = require('./cell-output-time')

exports.Cell = rclass
    propTypes :
        actions          : rtypes.object   # not defined = read only
        id               : rtypes.string.isRequired
        cm_options       : rtypes.object.isRequired
        cell             : rtypes.immutable.Map.isRequired
        is_current       : rtypes.bool
        is_selected      : rtypes.bool
        is_markdown_edit : rtypes.bool
        mode             : rtypes.string.isRequired    # the mode -- 'edit' or 'escape'
        font_size        : rtypes.number
        project_id       : rtypes.string
        directory        : rtypes.string
        complete         : rtypes.immutable.Map


    shouldComponentUpdate: (next) ->   # note: we assume project_id and directory don't change
        return next.id               != @props.id or \
               next.cm_options       != @props.cm_options or \
               next.cell             != @props.cell or \
               next.is_current       != @props.is_current or\
               next.is_selected      != @props.is_selected or \
               next.is_markdown_edit != @props.is_markdown_edit or \
               next.mode             != @props.mode or \
               next.font_size        != @props.font_size or \
               (next.complete        != @props.complete)  # only worry about complete when editing this cell!

    render_cell_input: (cell) ->
        <CellInput
            key              = 'in'
            cell             = {cell}
            actions          = {@props.actions}
            cm_options       = {@props.cm_options}
            is_markdown_edit = {@props.is_markdown_edit}
            is_focused       = {@props.is_current and @props.mode == 'edit'}
            is_current       = {@props.is_current}
            id               = {@props.id}
            font_size        = {@props.font_size}
            project_id       = {@props.project_id}
            directory        = {@props.directory}
            complete         = {@props.complete if @props.is_current}
            />

    render_cell_output: (cell) ->
        <CellOutput
            key        = 'out'
            cell       = {cell}
            actions    = {@props.actions}
            id         = {@props.id}
            project_id = {@props.project_id}
            directory  = {@props.directory}
            />

    render_time: (cell) ->
        if cell.get('start')?
            <div style={position:'relative', zIndex: 1, right: 0, width: '100%', paddingLeft:'5px'}, className='pull-right'>
                <div style={color:'#999', fontSize:'8pt', position:'absolute', right:'5px', lineHeight: 1.25, top: '1px', textAlign:'right'}>
                    <CellTiming
                        start = {cell.get('start')}
                        end   = {cell.get('end')}
                        state = {cell.get('state')}
                     />
                </div>
            </div>

    click_on_cell: (event) ->
        if not @props.actions?
            return
        if event.shiftKey
            misc_page.clear_selection()
            @props.actions.select_cell_range(@props.id)
        else
            @props.actions.set_cur_id(@props.id)
            @props.actions.unselect_all_cells()

    render: ->
        if @props.is_current
            # is the current cell
            if @props.mode == 'edit'
                # edit mode
                color1 = color2 = '#66bb6a'
            else
                # escape mode
                color1 = '#ababab'
                color2 = '#42a5f5'
        else
            if @props.is_selected
                color1 = color2 = '#e3f2fd'
            else
                color1 = color2 = 'white'
        style =
            border          : "1px solid #{color1}"
            borderLeft      : "5px solid #{color2}"
            padding         : '5px'

        if @props.is_selected
            style.background = '#e3f2fd'

        <div style={style} onClick={@click_on_cell}>
            {@render_time(@props.cell)}
            {@render_cell_input(@props.cell)}
            {@render_cell_output(@props.cell)}
        </div>