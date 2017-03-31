###
React component that renders the ordered list of cells
###

immutable = require('immutable')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Loading} = require('../r_misc')

{Cell} = require('./cell')

exports.CellList = rclass
    propTypes:
        actions     : rtypes.object   # if not defined, then everything read only
        cell_list   : rtypes.immutable.List.isRequired  # list of ids of cells in order
        cells       : rtypes.immutable.Map.isRequired
        font_size   : rtypes.number.isRequired
        sel_ids     : rtypes.immutable.Set            # set of selected cells
        md_edit_ids : rtypes.immutable.Set
        cur_id      : rtypes.string                   # cell with the green cursor around it; i.e., the cursor cell
        mode        : rtypes.string.isRequired
        cm_options  : rtypes.immutable.Map.isRequired
        project_id  : rtypes.string
        directory   : rtypes.string
        scrollTop   : rtypes.number
        complete    : rtypes.immutable.Map            # status of tab completion

    componentWillUnmount: ->
        # save scroll state
        state = ReactDOM.findDOMNode(@refs.cell_list)?.scrollTop
        if state? and @props.actions?
            @props.actions.set_scroll_state(state)

    componentDidMount: ->
        # restore scroll state
        if @props.scrollTop?
            ReactDOM.findDOMNode(@refs.cell_list)?.scrollTop = @props.scrollTop

    render_loading: ->
        <div style={fontSize: '32pt', color: '#888', textAlign: 'center', marginTop: '15px'}>
            <Loading/>
        </div>

    on_click: (e) ->
        @props.actions.clear_complete()
        if $(e.target).hasClass('cocalc-complete')
            # Bootstrap simulates a click even when user presses escape; can't catch there.
            # See the complete component in codemirror-static.
            @props.actions.set_mode('edit')

    render: ->
        if not @props.cell_list?
            return @render_loading()

        v = []
        @props.cell_list.map (id) =>
            cell = <Cell
                    key              = {id}
                    actions          = {@props.actions}
                    id               = {id}
                    cm_options       = {@props.cm_options}
                    cell             = {@props.cells.get(id)}
                    is_current       = {id == @props.cur_id}
                    is_selected      = {@props.sel_ids?.contains(id)}
                    is_markdown_edit = {@props.md_edit_ids?.contains(id)}
                    mode             = {@props.mode}
                    font_size        = {@props.font_size}
                    project_id       = {@props.project_id}
                    directory        = {@props.directory}
                    complete         = {@props.complete}
                    />
            v.push(cell)
            return
        style =
            fontSize        : "#{@props.font_size}px"
            paddingLeft     : '20px'
            padding         : '20px'
            backgroundColor : '#eee'
            height          : '100%'
            overflowY       : 'auto'
            overflowX       : 'hidden'

        <div key='cells' style={style} ref='cell_list' onClick={@on_click if @props.actions? and @props.complete?}>
            <div style={backgroundColor:'#fff', padding:'15px', boxShadow: '0px 0px 12px 1px rgba(87, 87, 87, 0.2)'}>
                {v}
            </div>
        </div>