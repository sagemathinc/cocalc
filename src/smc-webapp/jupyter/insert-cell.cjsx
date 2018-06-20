###
Insert a cell
###

{React, ReactDOM, rclass, rtypes}  = require('../app-framework')

{IS_TOUCH} = require('../feature')

exports.InsertCell = rclass
    propTypes:
        actions  : rtypes.object.isRequired
        id       : rtypes.string.isRequired
        position : rtypes.string  # 'above'  or 'below'

    getInitialState: ->
        hover : false

    shouldComponentUpdate: (next, s) ->
        return next.id != @props.id or next.position != @props.position or s.hover != @state.hover

    click: (e) ->
        @props.actions.set_cur_id(@props.id)
        new_id = @props.actions.insert_cell(if @props.position=='below' then 1 else -1)
        if e.shiftKey or e.ctrlKey or e.altKey or e.metaKey
            @props.actions.set_cell_type(new_id, "markdown")
        @setState(hover:false)

    render: ->
        style = {height:'6px'}
        if IS_TOUCH  # this whole approach makes no sense for a touch device, since no notion of hover, and is just confusing.
            return <div style={style}></div>
        if @state.hover
            style.backgroundColor = '#428bca'
        <div
            style        = {style}
            onClick      = {@click}
            onMouseEnter = {=>@setState(hover:true)}
            onMouseLeave = {=>@setState(hover:false)}
            >
        </div>