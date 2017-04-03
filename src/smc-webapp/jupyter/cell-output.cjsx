###
React component that describes the output of a cell
###

misc = require('smc-util/misc')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{CellOutputMessages} = require('./cell-output-message')

{OutputPrompt} = require('./prompt')

{OutputToggle, CollapsedOutput} = require('./cell-output-toggle')

exports.CellOutput = rclass
    propTypes :
        actions    : rtypes.object
        id         : rtypes.string.isRequired
        cell       : rtypes.immutable.Map.isRequired
        project_id : rtypes.string
        directory  : rtypes.string

    shouldComponentUpdate: (next) ->
        for field in ['collapsed', 'scrolled', 'exec_count', 'state']
            if next.cell.get(field) != @props.cell.get(field)
                return true

        new_output = next.cell.get('output')
        cur_output = @props.cell.get('output')
        if not new_output?
            return cur_output?
        if not cur_output?
            return new_output?
        return not new_output.equals(cur_output)

    render_output_prompt: ->
        collapsed = @props.cell.get('collapsed')
        exec_count = undefined
        output = @props.cell.get('output')
        output?.forEach (x) ->
            if x.has('execution_count')?
                exec_count = x.get('execution_count')
                return false
        prompt = <OutputPrompt
                    state      = {@props.cell.get('state')}
                    exec_count = {exec_count}
                    collapsed  = {collapsed}
                    />
        if not @props.actions? or collapsed or not output? or output.size == 0
            return prompt
        if @props.actions?
            <OutputToggle
                actions  = {@props.actions}
                id       = {@props.id}
                scrolled = {@props.cell.get('scrolled')}
                >
                {prompt}
            </OutputToggle>

    render_collapsed: ->
        <CollapsedOutput
            actions  = {@props.actions}
            id       = {@props.id}
        />

    render_output_value: ->
        if @props.cell.get('collapsed')
            return @render_collapsed()
        else
            output = @props.cell.get('output')
            if not output?
                return
            <CellOutputMessages
                scrolled   = {@props.cell.get('scrolled')}
                output     = {output}
                project_id = {@props.project_id}
                directory  = {@props.directory} />

    render: ->
        if not @props.cell.get('output')?
            return <div></div>
        <div key='out'  style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
            {@render_output_prompt()}
            {@render_output_value()}
        </div>
