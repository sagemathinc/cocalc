###
React component that describes the input of a cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{InputEditor}  = require('./input')

exports.CellInput = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        cm_options : rtypes.immutable.Map.isRequired
        cell       : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (nextProps) ->
        return nextProps.cell.get('input') != @props.cell.get('input') or \
            nextProps.cell.get('number') != @props.cell.get('number') or \
            nextProps.cm_options != @props.cm_options

    render_input_prompt: ->
        <div style={color:'#303F9F', minWidth: '14ex', fontFamily: 'monospace', textAlign:'right', padding:'.4em'}>
            In [{@props.cell.get('number') ? '*'}]:
        </div>

    render_input_value: ->
        <InputEditor
            value    = {@props.cell.get('input') ? ''}
            options  = {@props.cm_options}
            actions  = {@props.actions}
            id       = {@props.cell.get('id')}
        />

    render: ->
        <div style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
            {@render_input_prompt()}
            {@render_input_value()}
        </div>
