###
React component that describes the input of a cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{InputEditor}  = require('./input')

exports.CellInput = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        id         : rtypes.string.isRequired
        cm_options : rtypes.object.isRequired
        cell       : rtypes.immutable.Map.isRequired

    render_input_prompt: ->
        <div style={color:'#303F9F', minWidth: '14ex', fontFamily: 'monospace', textAlign:'right', padding:'.4em'}>
            In [{@props.cell.get('number') ? '*'}]:
        </div>

    render_input_value: ->
        <InputEditor
            value    = {@props.cell.get('input') ? ''}
            options  = {@props.cm_options}
            actions  = {@props.actions}
            id       = {@props.id}
        />

    render: ->
        <div style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
            {@render_input_prompt()}
            {@render_input_value()}
        </div>
