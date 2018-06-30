###
React component that renders the ordered list of cells
**as a single codemirror editor document**

Meant as a simple proof of concept.
###

immutable = require('immutable')

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{Loading} = require('../r_misc')

{Cell} = require('./cell')

syncstring = require('smc-util/syncstring')

underscore = require('underscore')

exports.CellList = rclass
    propTypes:
        actions     : rtypes.object.isRequired
        cell_list   : rtypes.immutable.List.isRequired  # list of ids of cells in order
        cells       : rtypes.immutable.Map.isRequired
        font_size   : rtypes.number.isRequired
        sel_ids     : rtypes.immutable.Set.isRequired   # set of selected cells
        md_edit_ids : rtypes.immutable.Set.isRequired
        cur_id      : rtypes.string                     # cell with the green cursor around it; i.e., the cursor cell
        mode        : rtypes.string.isRequired
        cm_options  : rtypes.immutable.Map

    render_loading: ->
        <div style={fontSize: '32pt', color: '#888', textAlign: 'center', marginTop: '15px'}>
            <Loading/>
        </div>

    compute_value: (cell_list, cells) ->
        v = []
        cell_list.map (id) =>
            cell = cells.get(id)
            s = "In[#{id}] #{cell.get('input')}"
            output = cell.get('output')
            if output?
                s += "\nOut[#{id}] #{JSON.stringify(output)}"
            v.push(s)
            return
        value = v.join('\n\n')
        return value

    parse_and_save: (value) ->
        while true
            i = value.indexOf('In[')
            if i == -1
                return
            value = value.slice(i+3)
            i = value.indexOf(']')
            if i == -1
                return
            id = value.slice(0, i)
            value = value.slice(i+2)
            prompt = "\nOut[#{id}]"
            i = value.indexOf(prompt)
            if i != -1
                value = value.slice(0, i)
            @props.actions.set_cell_input(id, value)
            value = value.slice(i+1)

    componentDidMount: ->
        @init_codemirror()

    _cm_destroy: ->
        if @cm?
            @cm.toTextArea()
            if @_cm_change?
                @cm.off('change', @_cm_change)
                delete @_cm_change
            delete @_cm_last_remote
            delete @cm

    _cm_cursor: ->
        if @cm._setValueNoJump   # if true, cursor move is being caused by external setValueNoJump
            return
        locs = ({x:c.anchor.ch, y:c.anchor.line} for c in @cm.listSelections())
        @props.actions.set_cursor_locs(locs)

    _cm_save: ->
        if not @cm?
            return
        value = @cm.getValue()
        if value != @_cm_last_remote # only save if we actually changed something
            @_cm_last_remote = value
            @parse_and_save(value)

    _cm_merge_remote: (cell_list, cells) ->
        if not @cm?
            return
        remote = @compute_value(cell_list, cells)
        if @_cm_last_remote?
            if @_cm_last_remote == remote
                return  # nothing to do
            local = @cm.getValue()
            new_val = syncstring.three_way_merge
                base   : @_cm_last_remote
                local  : local
                remote : remote
        else
            new_val = remote
        @_cm_last_remote = new_val
        @cm.setValueNoJump(new_val)

    _cm_undo: ->
        if not @props.actions.syncdb.in_undo_mode() or @cm.getValue() != @_cm_last_remote
            @_cm_save()
        @props.actions.undo()

    _cm_redo: ->
        @props.actions.redo()

    init_codemirror: ->
        @_cm_destroy()
        node = $(ReactDOM.findDOMNode(@)).find("textarea")[0]
        options = @props.cm_options?.toJS() ? {}
        @cm = CodeMirror.fromTextArea(node, options)
        $(@cm.getWrapperElement()).css(height: 'auto', backgroundColor:'#f7f7f7')
        @_cm_merge_remote(@props.cell_list, @props.cells)
        @_cm_change = underscore.debounce(@_cm_save, 1000)
        @cm.on('change', @_cm_change)

        # replace undo/redo by our sync aware versions
        @cm.undo = @_cm_undo
        @cm.redo = @_cm_redo

    componentWillReceiveProps: (next) ->
        if not @cm? or not @props.cm_options.equals(next.cm_options) or @props.font_size != next.font_size
            @init_codemirror()
            return
        if next.cells != @props.cells or next.cell_list != @props.cell_list
            @_cm_merge_remote(next.cell_list, next.cells)

    componentWillUnmount: ->
        if @cm?
            @_cm_save()
            doc = @cm.getDoc()
            delete doc.cm  # so @cm gets freed from memory when destroyed and doc is not attached to it.
            @_cm_destroy()

    render: ->
        window.w = @
        if not @props.cell_list?
            return @render_loading()

        style =
            fontSize        : "#{@props.font_size}px"
            paddingLeft     : '20px'
            padding         : '20px'
            backgroundColor : '#eee'
            height          : '100%'
            overflowY       : 'auto'
            overflowX       : 'hidden'

        <div key='cells' style={style} ref='cell_list'>
            <div style={backgroundColor:'#fff', padding:'15px', boxShadow: '0px 0px 12px 1px rgba(87, 87, 87, 0.2)'}>
                <textarea />
            </div>
        </div>