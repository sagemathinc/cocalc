###
React component that describes the output of a cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

exports.CellOutput = rclass
    propTypes :
        cell : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (next) ->
        if next.cell.get('collapsed') != @props.cell.get('collapsed')
            return true
        if next.cell.get('scrolled') != @props.cell.get('scrolled')
            return true
        new_output = next.cell.get('output')
        cur_output = @props.cell.get('output')
        if not new_output?
            return cur_output?
        if not cur_output?
            return new_output?
        return not new_output.equals(cur_output)

    render_output_prompt: ->
        n = @props.cell.get('number')
        if not n
            return
        <div style={color:'#D84315', minWidth: '14ex', fontFamily: 'monospace', textAlign:'right', padding:'.4em', paddingBottom:0}>
            Out[{n}]:
        </div>

    render_collapsed: ->
        <div>collapsed (todo)</div>

    render_output_value: ->
        if @props.cell.get('collapsed')
            return @render_collapsed()
        else
            output = (JSON.stringify(x) for x in @props.cell.get('output').toJS()).join('\n')
            <pre style={width:'100%', backgroundColor: '#fff', border: 0, padding: '9.5px 9.5px 0 0', marginBottom:0}>
                {output}
            </pre>

    render: ->
        if not @props.cell.get('output')?
            return <div></div>
        <div key='out'  style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
            {@render_output_prompt()}
            {@render_output_value()}
            {<div>scrolled</div> if @props.cell.get('scrolled')}
        </div>
