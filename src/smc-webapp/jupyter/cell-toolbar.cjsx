###
The toolbar at the top of each cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Slideshow} = require('./cell-toolbar-slideshow')

BAR_STYLE =
    width        : '100%'
    display      : 'flex'
    background   : '#eee'
    border       : '1px solid rgb(207, 207, 207)'
    borderRadius : '2px'

exports.CellToolbar = rclass
    propTypes :
        actions      : rtypes.object.isRequired
        cell_toolbar : rtypes.string.isRequired
        cell         : rtypes.immutable.Map.isRequired

    render: ->
        switch @props.cell_toolbar
            when 'slideshow'
                T = Slideshow
            else
                return <span> Toolbar not implemented: {@props.cell_toolbar} </span>
        <div style={BAR_STYLE}>
            <div style={flex:1}></div>
            <div>
                <T actions={@props.actions} cell={@props.cell} />
            </div>
        </div>
