###
React component that describes the output of a cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

exports.CellOutput = rclass
    propTypes :
        cell       : rtypes.immutable.Map.isRequired

    render_output_prompt: ->
        n = @props.cell.get('number')
        if not n
            return
        <div style={color:'#D84315', minWidth: '14ex', fontFamily: 'monospace', textAlign:'right', padding:'.4em', paddingBottom:0}>
            Out[{n}]:
        </div>

    render_output_value: ->
        <pre style={width:'100%', backgroundColor: '#fff', border: 0, padding: '9.5px 9.5px 0 0', marginBottom:0}>
            {@props.cell.get('output') ? ''}
        </pre>

    render: ->
        if not @props.cell.get('output')?
            return <div></div>
        <div key='out'  style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
            {@render_output_prompt()}
            {@render_output_value()}
        </div>
