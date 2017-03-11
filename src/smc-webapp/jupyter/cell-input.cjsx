###
React component that describes the input of a cell
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Markdown} = require('../r_misc')

{InputEditor}  = require('./input')

exports.CellInput = rclass
    propTypes :
        actions    : rtypes.object.isRequired
        cm_options : rtypes.immutable.Map.isRequired
        cell       : rtypes.immutable.Map.isRequired

    shouldComponentUpdate: (nextProps) ->
        return nextProps.cell.get('input') != @props.cell.get('input') or \
            nextProps.cell.get('number') != @props.cell.get('number') or \
            nextProps.cell.get('cell_type') != @props.cell.get('cell_type') or \
            nextProps.cm_options != @props.cm_options

    render_input_prompt: (type) ->
        if type != 'code'
            return <div style={minWidth: '14ex', fontFamily: 'monospace'}></div>
        <div style={color:'#303F9F', minWidth: '14ex', fontFamily: 'monospace', textAlign:'right', padding:'.4em'}>
            In [{@props.cell.get('number') ? '*'}]:
        </div>

    render_input_value: (type) ->
        switch type
            when 'code'
                <InputEditor
                    value    = {@props.cell.get('input') ? ''}
                    options  = {@props.cm_options}
                    actions  = {@props.actions}
                    id       = {@props.cell.get('id')}
                />
            when 'markdown'
                <Markdown
                    value      = {@props.cell.get('input') ? ''}
                    project_id = {@props.actions._project_id}
                    file_path  = {@props.actions._directory}
                    />
            else
                <div>
                    Unsupported cell type {type}
                </div>

    render: ->
        type = @props.cell.get('cell_type') ? 'code'
        <div style={display: 'flex', flexDirection: 'row', alignItems: 'stretch'}>
            {@render_input_prompt(type)}
            {@render_input_value(type)}
        </div>
