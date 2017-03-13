###
React component that renders the ordered list of cells
###

immutable = require('immutable')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Loading} = require('../r_misc')

{Cell} = require('./cell')

exports.CellList = rclass ({name}) ->
    propTypes :
        actions    : rtypes.object.isRequired

    reduxProps :
        "#{name}" :
            cell_list : rtypes.immutable.List  # list of ids of cells in order
            font_size : rtypes.number

    render: ->
        if not @props.cell_list?
            return <Loading/>

        v = []
        @props.cell_list.map (id) =>
            v.push <Cell key={id} name={name} id={id} actions={@props.actions} />
            return
        style =
            fontSize        : "#{@props.font_size}px"
            paddingLeft     : '20px'
            padding         : '20px'
            backgroundColor : '#eee'
            height          : '100%'
            overflowY       : 'auto'

        <div key='cells' style={style}>
            <div style={backgroundColor:'#fff', padding:'15px', boxShadow: '0px 0px 12px 1px rgba(87, 87, 87, 0.2)'}>
                {v}
            </div>
        </div>