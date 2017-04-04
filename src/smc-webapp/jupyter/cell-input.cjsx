###
React component that describes the input of a cell
###
immutable = require('immutable')

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')
{Markdown} = require('../r_misc')

{CodeMirror} = require('./codemirror')

{InputPrompt} = require('./prompt')

{cm_options} = require('./cm_options')

exports.CellInput = rclass
    propTypes:
        actions          : rtypes.object   # not defined = read only
        cm_options       : rtypes.immutable.Map.isRequired
        cell             : rtypes.immutable.Map.isRequired
        is_markdown_edit : rtypes.bool
        is_focused       : rtypes.bool
        is_current       : rtypes.bool
        font_size        : rtypes.number  # Not actually used, but it is CRITICAL that we re-render when this changes!
        project_id       : rtypes.string
        directory        : rtypes.string
        complete         : rtypes.immutable.Map              # status of tab completion

    shouldComponentUpdate: (next) ->
        return \
            next.cell.get('input')      != @props.cell.get('input') or \
            next.cell.get('exec_count') != @props.cell.get('exec_count') or \
            next.cell.get('cell_type')  != @props.cell.get('cell_type') or \
            next.cell.get('state')      != @props.cell.get('state') or \
            next.cell.get('cursors')    != @props.cell.get('cursors') or \
            next.cm_options             != @props.cm_options or \
            (next.is_markdown_edit      != @props.is_markdown_edit and next.cell.get('cell_type') == 'markdown') or \
            next.is_focused             != @props.is_focused or \
            next.is_current             != @props.is_current or \
            next.font_size              != @props.font_size or \
            next.complete               != @props.complete

    componentDidUpdate: ->
        if @props.is_current and not @props.is_focused
            elt = $(ReactDOM.findDOMNode(@))
            elt.scrollintoview
                direction: "vertical"
                viewPadding: { y: 150 }

    render_input_prompt: (type) ->
        <InputPrompt
            type       = {type}
            state      = {@props.cell.get('state')}
            exec_count = {@props.cell.get('exec_count')}
            kernel     = {@props.cell.get('kernel')}
            start      = {@props.cell.get('start')}
            end        = {@props.cell.get('end')}
        />

    handle_md_double_click: ->
        if not @props.actions?
            return
        id = @props.cell.get('id')
        @props.actions.set_md_cell_editing(id)
        @props.actions.set_cur_id(id)
        @props.actions.set_mode('edit')

    render_input_value: (type) ->
        id = @props.cell.get('id')
        switch type
            when 'code'
                <CodeMirror
                    value        = {@props.cell.get('input') ? ''}
                    options      = {@props.cm_options}
                    actions      = {@props.actions}
                    id           = {id}
                    is_focused   = {@props.is_focused}
                    font_size    = {@props.font_size}
                    cursors      = {@props.cell.get('cursors')}
                    complete     = {@props.complete}
                />
            when 'markdown'
                if @props.is_markdown_edit
                    <CodeMirror
                        value      = {@props.cell.get('input') ? ''}
                        options    = {cm_options('markdown')}
                        actions    = {@props.actions}
                        id         = {id}
                        is_focused = {@props.is_focused}
                        font_size  = {@props.font_size}
                        cursors    = {@props.cell.get('cursors')}
                    />
                else
                    value = @props.cell.get('input')?.trim()
                    if not value
                        value = 'Type *Markdown* and LaTeX: $\\alpha^2$'
                    <div onDoubleClick={@handle_md_double_click} style={width:'100%'}>
                        <Markdown
                            value      = {value}
                            project_id = {@props.project_id}
                            file_path  = {@props.directory}
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
