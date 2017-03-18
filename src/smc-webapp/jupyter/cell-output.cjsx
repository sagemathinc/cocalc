###
React component that describes the output of a cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{CellOutputMessage} = require('./cell-output-message')

exports.CellOutput = rclass
    propTypes :
        cell : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (next) ->
        if next.cell.get('collapsed') != @props.cell.get('collapsed')
            return true
        if next.cell.get('scrolled') != @props.cell.get('scrolled')
            return true
        if next.cell.get('exec_count') != @props.cell.get('exec_count')
            return true
        new_output = next.cell.get('output')
        cur_output = @props.cell.get('output')
        if not new_output?
            return cur_output?
        if not cur_output?
            return new_output?
        return not new_output.equals(cur_output)

    render_output_prompt: ->
        n = @props.cell.get('exec_count')
        if not n?
            return
        <div style={color:'#D84315', minWidth: '14ex', fontFamily: 'monospace', textAlign:'right', padding:'.4em', paddingBottom:0}>
            Out[{n}]:
        </div>

    render_collapsed: ->
        <div>collapsed (todo)</div>

    render_output_message: (n) ->
        msg = @props.cell.getIn(['output', "#{n}"])
        if not msg?
            return
        <CellOutputMessage
            key     = {n}
            message = {msg}
        />

    render_output_value: ->
        if @props.cell.get('collapsed')
            return @render_collapsed()
        else
            output = @props.cell.get('output')
            if not output?
                return
            v = (@render_output_message(n) for n in [0...output.size])
            <div style={width:'100%', lineHeight:'normal', backgroundColor: '#fff', border: 0, padding: '9.5px 9.5px 0 0', marginBottom:0}>
                {v}
            </div>

    render: ->
        if not @props.cell.get('output')?
            return <div></div>
        <div key='out'  style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
            {@render_output_prompt()}
            {@render_output_value()}
            {<div>scrolled</div> if @props.cell.get('scrolled')}
        </div>
