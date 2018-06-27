###
React component that describes a single cell
###

misc_page = require('../misc_page')
{COLORS}  = require('smc-util/theme')
misc      = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{Icon, Loading, Tip}    = require('../r_misc')

{CellInput}  = require('./cell-input')
{CellOutput} = require('./cell-output')

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
        is_focused       : rtypes.bool
        more_output      : rtypes.immutable.Map   # if given, is info for *this* cell
        cell_toolbar     : rtypes.string
        trust            : rtypes.bool
        editable         : rtypes.bool
        deleteable       : rtypes.bool

    shouldComponentUpdate: (next) ->   # note: we assume project_id and directory don't change
        return next.id               != @props.id or \
               next.cm_options       != @props.cm_options or \
               next.cell             != @props.cell or \
               next.is_current       != @props.is_current or\
               next.is_selected      != @props.is_selected or \
               next.is_markdown_edit != @props.is_markdown_edit or \
               next.mode             != @props.mode or \
               next.font_size        != @props.font_size or \
               next.is_focused       != @props.is_focused or \
               next.more_output      != @props.more_output or \
               next.cell_toolbar     != @props.cell_toolbar or \
               next.trust            != @props.trust or \
               next.editable         != @props.editable or \
               next.deleteable       != @props.deleteable or \
               (next.complete        != @props.complete and (next.is_current or @props.is_current))  # only worry about complete when editing this cell

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
            cell_toolbar     = {@props.cell_toolbar}
            trust            = {@props.trust}
            is_readonly      = {!@props.editable}
            />

    render_cell_output: (cell) ->
        <CellOutput
            key         = 'out'
            cell        = {cell}
            actions     = {@props.actions}
            id          = {@props.id}
            project_id  = {@props.project_id}
            directory   = {@props.directory}
            more_output = {@props.more_output}
            trust       = {@props.trust}
            />

    click_on_cell: (event) ->
        if not @props.actions?
            return
        if event.shiftKey and not @props.is_current
            misc_page.clear_selection()
            @props.actions.select_cell_range(@props.id)
        else
            @props.actions.set_cur_id(@props.id)
            @props.actions.unselect_all_cells()

    double_click: (event) ->
        return if not @props.actions?
        return if @props.cell.getIn(['metadata', 'editable']) == false
        return if @props.cell.get('cell_type') != 'markdown'
        @props.actions.unselect_all_cells()
        id = @props.cell.get('id')
        @props.actions.set_md_cell_editing(id)
        @props.actions.set_cur_id(id)
        @props.actions.set_mode('edit')
        event.stopPropagation()


    render_hook: ->
        if @props.is_current and @props.actions?
            <Hook name={@props.actions.name} />

    render_metadata_state: ->
        style =
            position   : 'absolute'
            top        : '2px'
            left       : '5px'
            color      : COLORS.GRAY_L
            whiteSpace : 'nowrap'

        if @props.is_current or @props.is_selected
            style.color = COLORS.BS_RED

        lock_style =
            marginRight  : '5px'

        <div style={style}>
            {
                if not @props.deletable
                    <Tip title={'Protected from deletion'} placement={'right'} size={'small'} style={lock_style}>
                        <Icon name='ban' />
                    </Tip>
            }
            {
                if not @props.editable
                    <Tip title={'Protected from modifications'} placement={'right'} size={'small'}>
                        <Icon name='lock' />
                    </Tip>
            }
        </div>

    render: ->
        if @props.is_current
            # is the current cell
            if @props.mode == 'edit'
                # edit mode
                color1 = color2 = '#66bb6a'
            else
                # escape mode
                if @props.is_focused
                    color1 = '#ababab'
                    color2 = '#42a5f5'
                else
                    color1 = '#eee'
                    color2 = '#42a5ff'
        else
            if @props.is_selected
                color1 = color2 = '#e3f2fd'
            else
                color1 = color2 = 'white'
        style =
            border          : "1px solid #{color1}"
            borderLeft      : "5px solid #{color2}"
            padding         : '2px 5px'
            position        : 'relative'

        if @props.is_selected
            style.background = '#e3f2fd'

        # Note that the cell id is used for the cell-list.cjsx scroll functionality.
        <div
            style     = {style}
            onMouseDown = {@click_on_cell if not @props.is_current}
            onDoubleClick = {@double_click}
            id        = {@props.id}
        >
            {@render_hook()}
            {@render_metadata_state()}
            {@render_cell_input(@props.cell)}
            {@render_cell_output(@props.cell)}
        </div>
###
VISIBLE_STYLE =
    position   : 'absolute'
    color      : '#ccc'
    fontSize   : '6pt'
    paddingTop : '5px'
    right      : '-10px'
    zIndex     : 10
###

NOT_VISIBLE_STYLE =
    position   : 'absolute'
    fontSize   : 0

Hook = rclass ({name}) ->
    reduxProps:
        "#{name}" :
            hook_offset : rtypes.number
            mode        : rtypes.string

    render: ->
        style = misc.copy(NOT_VISIBLE_STYLE)
        style.top = if @props.mode == 'edit' then @props.hook_offset
        <div
            style     = {style}
            className = 'cocalc-jupyter-hook'
        >
            <Icon name="circle" />
        </div>
