###
The toolbar at the top of each cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{Slideshow}   = require('./cell-toolbar-slideshow')
{Attachments} = require('./cell-toolbar-attachments')
{TagsToolbar} = require('./cell-toolbar-tags')
{Metadata}    = require('./cell-toolbar-metadata')

BAR_STYLE =
    width        : '100%'
    display      : 'flex'
    background   : '#eee'
    border       : '1px solid rgb(247, 247, 247)'
    borderRadius : '2px'
    margin       : '2px 0px'
    padding      : '2px'

exports.CellToolbar = rclass
    propTypes :
        actions      : rtypes.object.isRequired
        cell_toolbar : rtypes.string.isRequired
        cell         : rtypes.immutable.Map.isRequired

    render: ->
        switch @props.cell_toolbar
            when 'slideshow'
                T = Slideshow
            when 'attachments'
                T = Attachments
            when 'tags'
                T = TagsToolbar
            when 'metadata'
                T = Metadata
            else
                return <span> Toolbar not implemented: {@props.cell_toolbar} </span>
        <div style={BAR_STYLE}>
            <div style={flex:1}></div>
            <div>
                <T actions={@props.actions} cell={@props.cell} />
            </div>
        </div>
