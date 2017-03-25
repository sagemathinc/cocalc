###
React component that describes the output of a cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{CellOutputMessages} = require('./cell-output-message')

{OutputPrompt} = require('./prompt')

exports.CellOutput = rclass
    propTypes :
        cell       : rtypes.immutable.Map.isRequired
        project_id : rtypes.string
        directory  : rtypes.string

    shouldComponentUpdate: (next) ->
        if next.cell.get('collapsed') != @props.cell.get('collapsed')
            return true
        if next.cell.get('scrolled') != @props.cell.get('scrolled')
            return true
        if next.cell.get('exec_count') != @props.cell.get('exec_count')
            return true
        if next.cell.get('state') != @props.cell.get('state')
            return true
        new_output = next.cell.get('output')
        cur_output = @props.cell.get('output')
        if not new_output?
            return cur_output?
        if not cur_output?
            return new_output?
        return not new_output.equals(cur_output)

    render_output_prompt: ->
        <OutputPrompt
            state      = {@props.cell.get('state')}
            exec_count = {@props.cell.get('exec_count')}
        />

    render_collapsed: ->
        <div>collapsed (todo)</div>

    render_output_value: ->
        if @props.cell.get('collapsed')
            return @render_collapsed()
        else
            output = @props.cell.get('output')
            if not output?
                return
            <CellOutputMessages
                output     = {output}
                project_id = {@props.project_id}
                directory  = {@props.directory} />

    render: ->
        if not @props.cell.get('output')?
            return <div></div>
        <div key='out'  style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
            {@render_output_prompt()}
            {@render_output_value()}
            {<div>scrolled</div> if @props.cell.get('scrolled')}
        </div>
