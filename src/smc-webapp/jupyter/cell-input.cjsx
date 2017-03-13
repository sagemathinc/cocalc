###
React component that describes the input of a cell
###
immutable = require('immutable')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Markdown} = require('../r_misc')

{CodeMirrorEditor}  = require('./codemirror')

MD_OPTIONS = immutable.fromJS
    indentUnit : 4
    tabSize    : 4
    mode       : {name: "gfm2"}

exports.CellInput = rclass
    propTypes :
        actions     : rtypes.object.isRequired
        cm_options  : rtypes.immutable.Map.isRequired
        cell        : rtypes.immutable.Map.isRequired
        md_edit_ids : rtypes.immutable.Set.isRequired
        font_size   : rtypes.number  # Not actually used, but it is CRITICAL that we re-render when this changes!

    shouldComponentUpdate: (next) ->
        return next.cell.get('input') != @props.cell.get('input') or \
            next.cell.get('number') != @props.cell.get('number') or \
            next.cell.get('cell_type') != @props.cell.get('cell_type') or \
            next.cm_options != @props.cm_options or \
            (next.md_edit_ids != @props.md_edit_ids and next.cell.get('cell_type') == 'markdown') or \
            next.font_size != @props.font_size

    render_input_prompt: (type) ->
        if type != 'code'
            return <div style={minWidth: '14ex', fontFamily: 'monospace'}></div>
        <div style={color:'#303F9F', minWidth: '14ex', fontFamily: 'monospace', textAlign:'right', paddingRight:'.4em'}>
            In [{@props.cell.get('number') ? '*'}]:
        </div>

    render_input_value: (type) ->
        id = @props.cell.get('id')
        switch type
            when 'code'
                <CodeMirrorEditor
                    value     = {@props.cell.get('input') ? ''}
                    options   = {@props.cm_options}
                    actions   = {@props.actions}
                    id        = {id}
                    font_size = {@props.font_size}
                />
            when 'markdown'
                if @props.md_edit_ids.contains(id)
                    <CodeMirrorEditor
                        value     = {@props.cell.get('input') ? ''}
                        options   = {MD_OPTIONS}
                        actions   = {@props.actions}
                        id        = {id}
                        font_size = {@props.font_size}
                    />
                else
                    value = @props.cell.get('input')?.trim()
                    if not value
                        value = 'Type *Markdown* and LaTeX: $\\alpha^2$'
                    <div onDoubleClick={=>@props.actions.set_md_cell_editing(id)} style={width:'100%'}>
                        <Markdown
                            value      = {value}
                            project_id = {@props.actions._project_id}
                            file_path  = {@props.actions._directory}
                        />
                    </div>
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
